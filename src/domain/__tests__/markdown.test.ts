import { describe, it, expect } from 'vitest';
import { passportToMarkdown } from '../markdown';
import { createEmptyPassport, PassportV1 } from '../passport.schema';
import ecommerceFixture from '../../../tests/fixtures/ecommerce-passport.json';

describe('Markdown Serializer (passportToMarkdown)', () => {
  it('omits empty sections for an empty passport', () => {
    const empty = createEmptyPassport('Bare Minimal App');
    const md = passportToMarkdown(empty);

    expect(md).toContain('# Bare Minimal App');
    expect(md).toContain('Status: IN_PROGRESS | Schema: v1');
    expect(md).not.toContain('## Goal');
    expect(md).not.toContain('## Summary');
    expect(md).not.toContain('## Next Action');
    expect(md).not.toContain('## Tech Stack');
    expect(md).not.toContain('## Requirements');
    expect(md).not.toContain('## Decisions');
    expect(md).not.toContain('## Completed Work');
    expect(md).not.toContain('## Tasks');
    expect(md).not.toContain('## Bugs & Issues');
    expect(md).not.toContain('## AI Instructions');
    expect(md).not.toContain('## Open Questions');
    expect(md).not.toContain('## Project Files');
    expect(md).not.toContain('## Attached Conversations');
  });

  it('preserves stable section order for full passport', () => {
    const md = passportToMarkdown(ecommerceFixture as PassportV1);

    const goalIdx = md.indexOf('## Goal');
    const summaryIdx = md.indexOf('## Summary');
    const nextActionIdx = md.indexOf('## Next Action');
    const stackIdx = md.indexOf('## Tech Stack');
    const reqIdx = md.indexOf('## Requirements');
    const decisionsIdx = md.indexOf('## Decisions');
    const completedIdx = md.indexOf('## Completed Work');
    const tasksIdx = md.indexOf('## Tasks');
    const bugsIdx = md.indexOf('## Bugs & Issues');
    const instIdx = md.indexOf('## AI Instructions');
    const openQIdx = md.indexOf('## Open Questions');
    const filesIdx = md.indexOf('## Project Files');
    const convoIdx = md.indexOf('## Attached Conversations');

    expect(goalIdx).toBeGreaterThan(0);
    expect(summaryIdx).toBeGreaterThan(goalIdx);
    expect(nextActionIdx).toBeGreaterThan(summaryIdx);
    expect(stackIdx).toBeGreaterThan(nextActionIdx);
    expect(reqIdx).toBeGreaterThan(stackIdx);
    expect(decisionsIdx).toBeGreaterThan(reqIdx);
    expect(completedIdx).toBeGreaterThan(decisionsIdx);
    expect(tasksIdx).toBeGreaterThan(completedIdx);
    expect(bugsIdx).toBeGreaterThan(tasksIdx);
    expect(instIdx).toBeGreaterThan(bugsIdx);
    expect(openQIdx).toBeGreaterThan(instIdx);
    expect(filesIdx).toBeGreaterThan(openQIdx);
    expect(convoIdx).toBeGreaterThan(filesIdx);
  });

  it('renders markdown snapshot for the synthetic e-commerce fixture', () => {
    const md = passportToMarkdown(ecommerceFixture as PassportV1);
    expect(md).toMatchSnapshot();
  });
});
