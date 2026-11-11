#!/usr/bin/env node

/**
 * Project Passport — Cloud Content Publisher via Composio MCP
 * 
 * Executes scheduled social media publishing to LinkedIn and X (Twitter)
 * using the Composio cloud MCP endpoint. Runs cleanly in GitHub Actions
 * without requiring any local machine to stay on.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

const COMPOSIO_MCP_URL = 'https://connect.composio.dev/mcp';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

if (!COMPOSIO_API_KEY) {
  console.error('❌ Error: COMPOSIO_API_KEY environment variable is required.');
  process.exit(1);
}

// 1. Determine target date (IST: UTC+5:30)
function getTargetDate() {
  const manualDate = process.env.PUBLISH_DATE;
  if (manualDate && /^\d{4}-\d{2}-\d{2}$/.test(manualDate)) {
    return manualDate;
  }
  // Calculate IST date
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  return istDate.toISOString().slice(0, 10);
}

const targetDate = getTargetDate();
const dayDir = join(REPO_ROOT, 'marketing', 'daily-posts', targetDate);
const statusFile = join(dayDir, 'publishing-status.json');
const linkedinFile = join(dayDir, 'linkedin.md');
const xFile = join(dayDir, 'x.md');
const logFile = join(REPO_ROOT, 'marketing', 'publishing-log', 'log.jsonl');

console.log(`\n======================================================`);
console.log(`🚀 Project Passport Social Publisher (Composio MCP)`);
console.log(`📅 Target Date: ${targetDate} (IST)`);
console.log(`📁 Directory: ${dayDir}`);
console.log(`======================================================\n`);

if (!existsSync(dayDir) || !existsSync(statusFile)) {
  console.log(`⚠️ No content package found for date ${targetDate}.`);
  console.log(`Skipping publish. (Development monitoring creates posts daily).`);
  process.exit(0);
}

const status = JSON.parse(readFileSync(statusFile, 'utf8'));

// Helper to call Composio MCP JSON-RPC
async function callComposioMcp(method, params, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(COMPOSIO_MCP_URL, {
        method: 'POST',
        headers: {
          'x-consumer-api-key': COMPOSIO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = JSON.parse(line.slice(6));
          if (payload.error) {
            throw new Error(`Composio Error: ${JSON.stringify(payload.error)}`);
          }
          return payload.result;
        }
      }

      throw new Error(`Invalid SSE response format from Composio: ${text.slice(0, 200)}`);
    } catch (err) {
      console.warn(`[Attempt ${attempt}/${retries}] Call failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

// Helper to execute a tool via COMPOSIO_MULTI_EXECUTE_TOOL
async function executeTool(toolSlug, args, thought) {
  const result = await callComposioMcp('tools/call', {
    name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
    arguments: {
      sync_response_to_workbench: false,
      thought: thought || `Execute ${toolSlug}`,
      tools: [{ tool_slug: toolSlug, arguments: args }]
    }
  });

  const content = result?.content?.[0]?.text;
  if (!content) {
    throw new Error(`Empty response content from tool ${toolSlug}`);
  }

  const parsed = JSON.parse(content);
  const toolResult = parsed?.data?.results?.[0]?.response;
  if (!toolResult) {
    throw new Error(`No tool result returned: ${JSON.stringify(parsed)}`);
  }

  if (toolResult.successful === false) {
    throw new Error(`Tool execution unsuccessful: ${JSON.stringify(toolResult.error || toolResult)}`);
  }

  return toolResult.data;
}

let modified = false;

// 2. Publish to LinkedIn
async function publishLinkedIn() {
  if (status.linkedin?.publishedAt) {
    console.log(`✅ LinkedIn: Already published at ${status.linkedin.publishedAt}. Skipping.`);
    return;
  }

  if (!existsSync(linkedinFile)) {
    console.log(`⚠️ LinkedIn: No linkedin.md file found. Skipping.`);
    return;
  }

  const content = readFileSync(linkedinFile, 'utf8').trim();
  console.log(`📤 Publishing to LinkedIn (${content.length} chars)...`);

  try {
    const authorUrn = status.linkedin?.author_urn || 'urn:li:person:EFi4Y6e1mo';
    const result = await executeTool(
      'LINKEDIN_CREATE_LINKED_IN_POST',
      {
        author: authorUrn,
        commentary: content,
        visibility: 'PUBLIC'
      },
      'Publishing daily Project Passport update to LinkedIn'
    );

    const postUrn = result?.id || result?.urn || 'published';
    const postUrl = postUrn.startsWith('urn:li:share:')
      ? `https://www.linkedin.com/feed/update/${postUrn}/`
      : `https://www.linkedin.com/feed/update/${postUrn}/`;

    status.linkedin.status = 'published';
    status.linkedin.publishedAt = new Date().toISOString();
    status.linkedin.postUrl = postUrl;
    status.linkedin.postUrn = postUrn;
    status.linkedin.error = null;
    modified = true;

    console.log(`✅ LinkedIn post successful! Post URN: ${postUrn}`);
  } catch (err) {
    console.error(`❌ LinkedIn publication failed: ${err.message}`);
    status.linkedin.status = 'failed';
    status.linkedin.error = err.message;
    modified = true;
  }
}

// 3. Publish to X (Twitter)
async function publishX() {
  if (status.x?.publishedAt) {
    console.log(`✅ X: Already published at ${status.x.publishedAt}. Skipping.`);
    return;
  }

  if (!existsSync(xFile)) {
    console.log(`⚠️ X: No x.md file found. Skipping.`);
    return;
  }

  const rawContent = readFileSync(xFile, 'utf8').trim();
  console.log(`📤 Publishing to X (Twitter)...`);

  try {
    // Parse tweets (divided by double newline numbers like "1/", "2/" or "---")
    const tweetBlocks = rawContent
      .split(/\n---\n/)
      .map(b => b.trim())
      .filter(Boolean);

    // If no "---" dividers, check for numbered paragraphs
    const tweets = tweetBlocks.length > 1 ? tweetBlocks : [rawContent];

    let lastTweetId = null;
    const tweetIds = [];

    for (let i = 0; i < tweets.length; i++) {
      const tweetText = tweets[i];
      const args = { text: tweetText };

      if (lastTweetId) {
        args.reply_in_reply_to_tweet_id = lastTweetId;
      }

      console.log(`  Posting tweet ${i + 1}/${tweets.length} (${tweetText.length} chars)...`);
      const result = await executeTool(
        'TWITTER_CREATION_OF_A_POST',
        args,
        `Publishing tweet ${i + 1} of Project Passport update`
      );

      const tweetId = result?.id || result?.data?.id;
      if (tweetId) {
        lastTweetId = tweetId;
        tweetIds.push(tweetId);
      }
      // Small pause between thread posts
      if (i < tweets.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    const firstId = tweetIds[0];
    const postUrl = firstId ? `https://x.com/ranveerbuilds/status/${firstId}` : null;

    status.x.status = 'published';
    status.x.publishedAt = new Date().toISOString();
    status.x.postUrl = postUrl;
    status.x.threadIds = tweetIds;
    status.x.error = null;
    modified = true;

    console.log(`✅ X post successful! URL: ${postUrl || 'published'}`);
  } catch (err) {
    console.error(`❌ X publication failed: ${err.message}`);
    status.x.status = 'failed';
    status.x.error = err.message;
    modified = true;
  }
}

async function run() {
  await publishLinkedIn();
  await publishX();

  if (modified) {
    writeFileSync(statusFile, JSON.stringify(status, null, 2) + '\n');
    console.log(`💾 Updated status saved to ${statusFile}`);

    // Append to publishing log
    const logEntry = {
      timestamp: new Date().toISOString(),
      date: targetDate,
      linkedin: status.linkedin,
      x: status.x
    };
    writeFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    console.log(`📝 Appended entry to ${logFile}`);
  }

  console.log(`\n🎉 Publishing routine completed.\n`);
}

run().catch(err => {
  console.error('Fatal error in publishing process:', err);
  process.exit(1);
});
