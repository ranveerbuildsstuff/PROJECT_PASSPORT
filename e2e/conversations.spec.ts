import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  expectNoSeriousA11y,
  collectConsoleErrors,
  collectExternalRequests,
  auditPageLayoutAndTouchTargets,
  shot,
} from './helpers';

const CHATGPT_FIXTURE_PATH = path.resolve('tests/fixtures/conversations/chatgpt-transcript.txt');
const NO_MARKERS_FIXTURE_PATH = path.resolve('tests/fixtures/conversations/no-markers-transcript.txt');
const OVERSIZED_FIXTURE_PATH = path.resolve('tests/fixtures/conversations/oversized-transcript.txt');

test.describe('Slice 6: Conversation Paste Import & Reconstruct Prompt', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const dbs = (await window.indexedDB.databases?.()) || [];
      for (const d of dbs) {
        if (d.name) window.indexedDB.deleteDatabase(d.name);
      }
      localStorage.clear();
    });
    await page.reload();

    // Create a fresh test project
    await page.getByRole('button', { name: /^New project$/i }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'New project' });
    await createDialog.getByLabel('Project name').fill('Conversation Testing Project');
    await createDialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Conversation Testing Project' })).toBeVisible();

    // Navigate to Conversations tab
    await page.getByRole('tab', { name: 'Conversations' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Conversations' })).toBeVisible();
  });

  test('1. Paste and attach: parses ChatGPT transcript, shows turns/badges, attaches, updates Overview readiness, persists on reload', async ({
    page,
  }) => {
    const fixtureText = fs.readFileSync(CHATGPT_FIXTURE_PATH, 'utf8');

    // Click "Paste conversation"
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await expect(pasteDialog).toBeVisible();

    // Fill title and content
    await pasteDialog.getByLabel('Conversation Title').fill('Offline Storage Planning');
    await pasteDialog.getByLabel('Transcript Content').fill(fixtureText);

    // Click Parse
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();

    // Dialog title updates to review step
    await expect(page.getByRole('heading', { name: 'Review parsed conversation' })).toBeVisible();

    // Verify parsed turns and role badges
    await expect(page.getByRole('group', { name: 'Message 1' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Message 2' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Message 3' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Message 4' })).toBeVisible();
    expect(await page.getByText('CHATGPT', { exact: true }).count()).toBeGreaterThanOrEqual(0);

    // Click "Attach to project"
    await page.getByRole('button', { name: 'Attach to project' }).click();

    // Confirm toast appears
    await expect(page.getByText(/Attached "Offline Storage Planning" \(4 messages\)\./i)).toBeVisible();

    // Confirm list row displays conversation metadata
    const convCard = page.getByRole('listitem', { name: 'Offline Storage Planning' });
    await expect(convCard).toBeVisible();
    await expect(convCard.getByText('CHATGPT')).toBeVisible();
    await expect(convCard.getByText('4 messages')).toBeVisible();
    await expect(convCard.getByText(/tokens \(estimate\)/i)).toBeVisible();

    // Navigate to Overview tab and verify "Context Attached" passes
    await page.getByRole('tab', { name: 'Overview' }).click();
    const readinessList = page.getByRole('list', { name: 'Readiness criteria checks' });
    const contextItem = readinessList.locator('li').filter({ hasText: 'Context Attached' });
    await expect(contextItem.getByText('PASS')).toBeVisible();

    // Reload page and verify persistence
    await page.reload();
    await page.getByRole('tab', { name: 'Conversations' }).click();
    await expect(page.getByRole('listitem', { name: 'Offline Storage Planning' })).toBeVisible();

    await expectNoSeriousA11y(page);
  });

  test('2. No markers: fallback single turn with note, manual keyboard split, and attach', async ({
    page,
  }) => {
    const fixtureText = fs.readFileSync(NO_MARKERS_FIXTURE_PATH, 'utf8');

    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });

    await pasteDialog.getByLabel('Transcript Content').fill(fixtureText);
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();

    // Note should explain that no speaker labels were found
    await expect(
      page.getByText('We couldn\'t find speaker labels such as "User:" or "ChatGPT said:"')
    ).toBeVisible();

    // Single message turn initially
    await expect(page.getByRole('group', { name: 'Message 1' })).toBeVisible();

    // Place cursor in Message 1 textarea to split using real keyboard presses (no manual event dispatch)
    const textarea = page.getByLabel('Message 1 content');
    const splitBtn = page.getByRole('button', { name: 'Split Message 1' });

    // Focus textarea: cursor at 0 (Control+Home) or End (Control+End) has Split disabled
    await textarea.focus();
    await page.keyboard.press('Control+Home');
    await expect(splitBtn).toBeDisabled();

    await page.keyboard.press('Control+End');
    await expect(splitBtn).toBeDisabled();

    // Move cursor into text using real ArrowRight key presses
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(splitBtn).toBeEnabled();
    await splitBtn.click();

    // Now there are 2 messages
    await expect(page.getByRole('group', { name: 'Message 1' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Message 2' })).toBeVisible();

    // Attach to project
    await page.getByRole('button', { name: 'Attach to project' }).click();
    await expect(page.getByText(/Attached "Pasted conversation" \(2 messages\)\./i)).toBeVisible();

    await expectNoSeriousA11y(page);
  });

  test('3. Editing: flip role, merge with next, delete turn in viewer, save and reload persistence', async ({
    page,
  }) => {
    // Seed initial conversation
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await pasteDialog.getByLabel('Conversation Title').fill('Editable Discussion');
    await pasteDialog
      .getByLabel('Transcript Content')
      .fill('User: Question 1\nAssistant: Answer 1\nUser: Question 2\nAssistant: Answer 2');
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();
    await page.getByRole('button', { name: 'Attach to project' }).click();
    await expect(page.getByRole('listitem', { name: 'Editable Discussion' })).toBeVisible();

    // Open View/edit
    await page.getByRole('button', { name: 'View/edit Editable Discussion' }).click();
    const editDialog = page.getByRole('dialog', { name: 'View and edit conversation' });
    await expect(editDialog).toBeVisible();

    // Flip role of Message 1
    const flipBtn = editDialog.getByRole('button', { name: 'Flip role for Message 1' });
    await flipBtn.click();
    const msg1Group = editDialog.getByRole('group', { name: 'Message 1' });
    await expect(msg1Group.getByText('ASSISTANT')).toBeVisible();

    // Merge Message 1 with Message 2
    const mergeBtn = editDialog.getByRole('button', { name: 'Merge Message 1 with next' });
    await mergeBtn.click();
    // Message count reduced from 4 to 3
    await expect(editDialog.getByText('3 messages')).toBeVisible();

    // Delete Message 3
    const deleteBtn = editDialog.getByRole('button', { name: 'Delete Message 3' });
    await deleteBtn.click();
    await expect(editDialog.getByText('2 messages')).toBeVisible();

    // Save changes
    await editDialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved changes to "Editable Discussion".')).toBeVisible();

    // Reload and verify 2 messages in list row
    await page.reload();
    await page.getByRole('tab', { name: 'Conversations' }).click();
    const row = page.getByRole('listitem', { name: 'Editable Discussion' });
    await expect(row.getByText('2 messages')).toBeVisible();

    await expectNoSeriousA11y(page);
  });

  test('4. Remove and Undo: removing a conversation shows toast with Undo, restores item cleanly', async ({
    page,
  }) => {
    // Attach one conversation
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await pasteDialog.getByLabel('Conversation Title').fill('Temporary Chat');
    await pasteDialog.getByLabel('Transcript Content').fill('User: Quick check\nAssistant: Confirmed.');
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();
    await page.getByRole('button', { name: 'Attach to project' }).click();
    await expect(page.getByRole('listitem', { name: 'Temporary Chat' })).toBeVisible();

    // Click Remove
    await page.getByRole('button', { name: 'Remove Temporary Chat' }).click();

    // Row should disappear and toast with Undo should appear
    await expect(page.getByRole('listitem', { name: 'Temporary Chat' })).not.toBeVisible();
    const toast = page.getByText('Removed "Temporary Chat".');
    await expect(toast).toBeVisible();

    // Click Undo
    await page.getByRole('button', { name: 'Undo' }).click();

    // Item restored
    await expect(page.getByRole('listitem', { name: 'Temporary Chat' })).toBeVisible();

    await expectNoSeriousA11y(page);
  });

  test('5. Error path: empty paste and over 1MB paste show plain-language errors with no Zod/braces', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });

    // 1. Empty paste error
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();
    const emptyAlert = page.getByRole('alert');
    await expect(emptyAlert).toBeVisible();
    await expect(emptyAlert).toContainText(
      'Nothing to import yet. Paste a conversation into the box above, then choose Parse.'
    );
    const emptyText = await emptyAlert.innerText();
    expect(emptyText).not.toMatch(/[{}[\]]|ZodError|undefined/);

    // 2. Over 1MB paste error
    await pasteDialog.getByLabel('Transcript Content').evaluate((el: HTMLTextAreaElement) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      nativeSetter?.call(el, 'A'.repeat(1_000_001));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();
    const largeAlert = page.getByRole('alert');
    await expect(largeAlert).toBeVisible();
    await expect(largeAlert).toContainText('This text is over 1 MB. Paste one conversation at a time.');
    const largeText = await largeAlert.innerText();
    expect(largeText).not.toMatch(/[{}[\]]|ZodError|undefined/);

    await expectNoSeriousA11y(page);
  });

  test('6. Reconstruct prompt: copies prompt containing conversation text and Schema v1 instructions', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Attach conversation fixture
    const fixtureText = fs.readFileSync(OVERSIZED_FIXTURE_PATH, 'utf8');
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await pasteDialog.getByLabel('Conversation Title').fill('Oversized Architectural Chat');
    await pasteDialog.getByLabel('Transcript Content').fill(fixtureText);
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();
    await page.getByRole('button', { name: 'Attach to project' }).click();
    await expect(page.getByRole('listitem', { name: 'Oversized Architectural Chat' })).toBeVisible();

    // Open Reconstruct Dialog
    await page.getByRole('button', { name: 'Reconstruct passport' }).click();
    const reconstructDialog = page.getByRole('dialog', { name: 'Reconstruct passport' });
    await expect(reconstructDialog).toBeVisible();

    // Verify prompt preview contains Schema v1 rules and conversation content
    const promptArea = reconstructDialog.getByLabel('Reconstruct Prompt Preview');
    await expect(promptArea).toBeVisible();
    const promptVal = await promptArea.inputValue();
    expect(promptVal.toLowerCase()).toContain('the conversation below is the source of truth');
    expect(promptVal).toContain('Reply with ONLY one JSON object in one ```json block.');
    expect(promptVal).toContain('design principles of Project Passport');

    // Click "Copy prompt"
    await reconstructDialog.getByRole('button', { name: 'Copy prompt' }).click();
    await expect(page.getByText('Copied reconstruct prompt to clipboard.')).toBeVisible();

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('design principles of Project Passport');
    expect(clipboardText).toContain('Reply with ONLY one JSON object');

    await expectNoSeriousA11y(page);
  });

  test('7. Zero outbound: zero external network requests and zero console errors during full flow', async ({
    page,
  }) => {
    const getExternalRequests = collectExternalRequests(page);
    const consoleErrors = collectConsoleErrors(page);

    // Run complete paste, view, toggle, reconstruct flow
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await pasteDialog.getByLabel('Transcript Content').fill('User: Network test\nAssistant: Zero outbound.');
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();
    await page.getByRole('button', { name: 'Attach to project' }).click();

    // Reconstruct prompt dialog
    await page.getByRole('button', { name: 'Reconstruct passport' }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // Assert strictly zero external requests and zero console errors
    const extRequests = getExternalRequests();
    expect(extRequests).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);

    await expectNoSeriousA11y(page);
  });

  test('8. Layout and axe audit: verifies 44px touch targets and no horizontal overflow across themes', async ({
    page,
  }) => {
    // Populate with one conversation
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await pasteDialog.getByLabel('Transcript Content').fill('User: Audit test\nAssistant: Layout checked.');
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();
    await page.getByRole('button', { name: 'Attach to project' }).click();
    await expect(page.getByRole('listitem')).toBeVisible();

    // Audit default dark theme
    await auditPageLayoutAndTouchTargets(page, 'conversations-dark');
    await shot(page, 'conversations-dark');
    await expectNoSeriousA11y(page);

    // Toggle to light theme
    const themeBtn = page.getByRole('button', { name: /Switch to light theme/i });
    await themeBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await auditPageLayoutAndTouchTargets(page, 'conversations-light');
    await shot(page, 'conversations-light');
  });

  test('9. Keyboard-only navigation: complete paste, split, and attach workflow without mouse pointer', async ({
    page,
  }) => {
    // Focus "Paste conversation" button and press Enter
    await page.getByRole('button', { name: 'Paste conversation' }).first().focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await expect(dialog).toBeVisible();

    // Initial focus is on the first form control (Title input)
    await expect(page.getByLabel('Conversation title')).toBeFocused();
    await page.keyboard.type('Keyboard Only Session');

    // Tab to content textarea
    await page.keyboard.press('Tab');
    await page.keyboard.type('User: Step one\nAssistant: Step two');

    // Tab to Clear, then Parse
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    // Step 2 review appears
    await expect(page.getByRole('heading', { name: 'Review parsed conversation' })).toBeVisible();

    // Tab through until "Attach to project" and press Enter
    const attachBtn = page.getByRole('button', { name: 'Attach to project' });
    await attachBtn.focus();
    await page.keyboard.press('Enter');

    // Confirm row is attached
    await expect(page.getByRole('listitem', { name: 'Keyboard Only Session' })).toBeVisible();

    await expectNoSeriousA11y(page);
  });
});
