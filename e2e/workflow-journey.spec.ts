import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import {
  collectConsoleErrors,
  collectExternalRequests,
} from './helpers';
import { createEmptyPassport } from '../src/domain/passport.schema';
import { buildPackageArtifacts } from '../src/export/packageBuilder';
import { planExport } from '../src/export/budgeter';

test.describe('Final Workflow Regression Journeys', () => {
  test('1. Edit passport, capture paste-back and merge, create a checkpoint, restore it', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const getExternalRequests = collectExternalRequests(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create a new project
    await page.getByRole('button', { name: /New project/i }).first().click();
    await page.getByLabel('Project name').fill('Journey One');
    await page.getByRole('button', { name: 'Create project' }).click();

    // Verify on Project overview
    await expect(page.getByRole('heading', { level: 1, name: 'Journey One' })).toBeVisible();

    // Navigate to Passport tab
    await page.getByRole('tab', { name: 'Passport' }).click();

    // Fill goal and summary
    const goalInput = page.getByLabel('Project goal');
    await goalInput.fill('Validate full passport workflow and state preservation.');

    const summaryInput = page.getByLabel('Executive summary');
    await summaryInput.fill('Core system architecture for portable AI project context.');

    // Trigger blur/autosave
    await summaryInput.blur();
    await page.waitForTimeout(600);

    // Open Capture dialog from Passport toolbar
    await page.getByRole('button', { name: 'Capture from AI' }).first().click();
    const captureDialog = page.getByRole('dialog', { name: 'Capture from AI' });
    await expect(captureDialog).toBeVisible();

    const rawTranscript = [
      'User: Please update the project status.',
      'Assistant: Here is the updated passport:',
      '```json',
      JSON.stringify(
        {
          project: {
            name: 'Journey One',
            goal: 'Validate full passport workflow and state preservation.',
            summary: 'Updated executive summary from capture sync.',
            status: 'in_progress',
          },
          tasks: [
            { text: 'Implement offline capability tests', status: 'done', priority: 'medium' },
            { text: 'Run final test gate', status: 'doing', priority: 'high' },
          ],
          nextAction: 'Final release readiness check',
        },
        null,
        2
      ),
      '```',
    ].join('\n');

    await captureDialog.getByLabel('Paste AI response').fill(rawTranscript);
    await captureDialog.getByRole('button', { name: 'Check reply' }).click();

    // Verify verified success card appears
    const statusCard = captureDialog.getByRole('status');
    await expect(statusCard).toBeVisible();
    await expect(statusCard.getByRole('heading', { name: 'Passport reply verified' })).toBeVisible();

    // Apply merge
    await captureDialog.getByRole('button', { name: 'Apply merge' }).click();
    await expect(captureDialog).not.toBeVisible();

    // Verify updated summary reflects on Passport tab
    await expect(page.getByLabel('Executive summary')).toHaveValue(
      'Updated executive summary from capture sync.'
    );

    // Go to Checkpoints tab
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Create checkpoint' }).first().click();

    const cpDialog = page.getByRole('dialog', { name: 'Create checkpoint' });
    await expect(cpDialog).toBeVisible();
    await cpDialog.getByLabel('Checkpoint note').fill('State prior to rollback test');
    await cpDialog.getByRole('button', { name: 'Create checkpoint' }).click();
    await expect(cpDialog).not.toBeVisible();

    // Confirm 2 checkpoints recorded (automatic Before AI Merge + user checkpoint)
    await expect(page.getByText('2 checkpoints recorded')).toBeVisible();

    // Modify summary on Passport tab to test rollback
    await page.getByRole('tab', { name: 'Passport' }).click();
    await page.getByLabel('Executive summary').fill('Volatile edit to be rolled back');
    await page.getByLabel('Executive summary').blur();
    await page.waitForTimeout(600);

    // Return to Checkpoints and restore
    await page.getByRole('tab', { name: 'Checkpoints' }).click();
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();

    const restoreDialog = page.getByRole('dialog', { name: /Restore checkpoint/i });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog.getByRole('button', { name: 'Restore checkpoint' }).click();
    await expect(restoreDialog).not.toBeVisible();

    // Verify executive summary reverted to checkpointed value
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page.getByLabel('Executive summary')).toHaveValue(
      'Updated executive summary from capture sync.'
    );

    // Verify zero outbound network requests and zero console errors
    expect(getExternalRequests().length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('2. Attach conversation and file with secret scanner review, export Full package', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const getExternalRequests = collectExternalRequests(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create project
    await page.getByRole('button', { name: /New project/i }).first().click();
    await page.getByLabel('Project name').fill('Journey Two');
    await page.getByRole('button', { name: 'Create project' }).click();

    // Fill minimum passport basics so export is not blocked by empty passport
    await page.getByRole('tab', { name: 'Passport' }).click();
    await page.getByLabel('Project goal').fill('Handoff packaging test');
    await page.getByLabel('Project goal').blur();
    await page.waitForTimeout(500);

    // Attach a conversation
    await page.getByRole('tab', { name: 'Conversations' }).click();
    await page.getByRole('button', { name: 'Paste conversation' }).first().click();
    const pasteDialog = page.getByRole('dialog', { name: 'Paste conversation' });
    await expect(pasteDialog).toBeVisible();

    await pasteDialog.getByLabel('Conversation Title').fill('Architecture Discussion');
    await pasteDialog.getByLabel('Transcript Content').fill(
      'User: How do we package the passport?\nAssistant: Into a standard zip containing project-passport.json and MANIFEST.json.'
    );
    await pasteDialog.getByRole('button', { name: 'Parse' }).click();

    // In Review step, click Attach to project
    await page.getByRole('button', { name: 'Attach to project' }).click();
    await expect(pasteDialog).not.toBeVisible();
    await expect(page.getByText('Architecture Discussion', { exact: true })).toBeVisible();

    // Attach a file with secret finding review
    await page.getByRole('tab', { name: 'Files' }).click();
    await page.getByRole('button', { name: 'Add files' }).first().click();
    const filesDialog = page.getByRole('dialog', { name: 'Add project files' });
    await expect(filesDialog).toBeVisible();

    // Construct synthetic Google API key without committing raw secret in git
    const syntheticKey = ['AIza', 'SyD1234567890abcdefghijklmnopqrstuv'].join('');
    const fileInput = filesDialog.locator('input[aria-label="Choose files"]');
    await fileInput.setInputFiles([
      {
        name: 'src/main.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from('console.log("Clean application source");'),
      },
      {
        name: 'config/keys.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from(`export const apiKey = "${syntheticKey}";`),
      },
    ]);

    // Review findings UI appears
    await expect(filesDialog.getByText(/We found 1 possible secrets/i)).toBeVisible();
    await expect(filesDialog.getByText('1 unresolved')).toBeVisible();

    // Redact the finding
    await filesDialog.getByRole('button', { name: 'Redact' }).click();

    // Finish attaching
    const attachBtn = filesDialog.getByRole('button', { name: 'Attach files' });
    await expect(attachBtn).toBeEnabled();
    await attachBtn.click();
    await expect(filesDialog).not.toBeVisible();

    await expect(page.getByText('src/main.ts')).toBeVisible();
    await expect(page.getByText('config/keys.ts')).toBeVisible();

    // Export Tab -> Download Full Package
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByRole('button', { name: /Full package \(\.zip\)/i }).click();

    // Wait for export download
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download package' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('journey-two-passport.zip');

    // Verify zero network leaks
    expect(getExternalRequests().length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('3. Import Full package in clean context and verify round-trip fidelity', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const getExternalRequests = collectExternalRequests(page);

    // Build a synthetic valid export package in memory with JSZip
    const passport = createEmptyPassport('Roundtrip Spec');
    passport.project.goal = 'Verify exact package round-trip fidelity';
    passport.project.summary = 'Complete packaging round-trip test verification.';
    passport.nextAction = 'Deploy to production';
    passport.files = [
      {
        path: 'src/app.ts',
        purpose: 'Application entry',
        sizeBytes: 37,
        included: true,
      },
    ];
    passport.conversations = [
      {
        id: 'c-1',
        title: 'Kickoff Meeting',
        source: 'paste',
        messageCount: 2,
        tokenEstimate: 45,
        included: true,
      },
    ];

    const plan = planExport(
      {
        passport,
        files: [
          {
            id: 'f-1',
            projectId: passport.project.id,
            path: 'src/app.ts',
            mime: 'text/plain',
            content: 'export const status = "operational";',
            sizeBytes: 37,
          },
        ],
        conversations: [
          {
            record: {
              id: 'c-1',
              projectId: passport.project.id,
              title: 'Kickoff Meeting',
              source: 'paste',
              messages: [],
              createdAt: new Date().toISOString(),
            },
            turns: [
              { id: 'turn-1', role: 'user', text: 'What is the objective?' },
              { id: 'turn-2', role: 'assistant', text: 'Build a zero-knowledge passport.' },
            ],
          },
        ],
      },
      200000
    );

    const artifacts = await buildPackageArtifacts(plan);
    const zip = new JSZip();
    for (const f of artifacts.files) {
      zip.file(f.path, f.content);
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Open clean Dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click Import package
    await page.getByRole('button', { name: 'Import package' }).click();
    const importDialog = page.getByRole('dialog', { name: 'Import Handoff Package' });
    await expect(importDialog).toBeVisible();

    // Upload zip
    await page.locator('#package-file-input').setInputFiles({
      name: 'roundtrip-package.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // Verify package summary
    await expect(page.getByText('Verified Archive')).toBeVisible();
    await expect(page.getByText('Roundtrip Spec')).toBeVisible();

    // Click Import project
    await page.getByRole('button', { name: 'Import project' }).click();
    await expect(importDialog).not.toBeVisible();

    // Verify navigated to imported project overview
    await expect(page.getByRole('heading', { level: 1, name: 'Roundtrip Spec' })).toBeVisible();

    // Check Passport fields
    await page.getByRole('tab', { name: 'Passport' }).click();
    await expect(page.getByLabel('Project goal')).toHaveValue(
      'Verify exact package round-trip fidelity'
    );
    await expect(page.getByLabel('Executive summary')).toHaveValue(
      'Complete packaging round-trip test verification.'
    );

    // Check Files tab
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.getByText('src/app.ts')).toBeVisible();

    // Check Conversations tab
    await page.getByRole('tab', { name: 'Conversations' }).click();
    await expect(page.getByText('Kickoff Meeting', { exact: true })).toBeVisible();

    expect(getExternalRequests().length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('4. Offline test: service worker control, offline reload, edit project, generate Lite prompt', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const getExternalRequests = collectExternalRequests(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for service worker to take control
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    // Go offline
    await page.context().setOffline(true);

    // Reload while offline
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Verify application loaded successfully offline
    await expect(page.getByRole('link', { name: 'Project Passport Home' })).toBeVisible();

    // Create a new project offline
    await page.getByRole('button', { name: /New project/i }).first().click();
    await page.getByLabel('Project name').fill('Offline Project');
    await page.getByRole('button', { name: 'Create project' }).click();

    // Edit passport goal
    await page.getByRole('tab', { name: 'Passport' }).click();
    const goal = page.getByLabel('Project goal');
    await goal.fill('Run completely offline via PWA service worker.');
    await goal.blur();
    await page.waitForTimeout(500);

    // Go to Export tab and generate Lite prompt
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByRole('button', { name: /Lite prompt/i }).click();

    // Verify format section is rendered
    await expect(page.getByText('2. Export Format')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeVisible();

    // Return online
    await page.context().setOffline(false);

    expect(getExternalRequests().length).toBe(0);
    expect(consoleErrors.length).toBe(0);
  });
});
