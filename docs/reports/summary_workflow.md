Session Compaction/Summarization Logic
Automatic Triggering:
1. Token Overflow Detection: The system automatically triggers compaction when the session exceeds token limits
   - In SessionCompaction.isOverflow(): checks if input.tokens + cache.read + output > (context - output_limit)
   - This is checked in session/prompt.ts during message processing
   - When overflow is detected, SessionCompaction.run() is called automatically
2. Manual Triggering:
   - Via POST /session/:id/summarize endpoint
   - This allows manual triggering of compaction via slash commands or UI
How Compaction Works:
1. Creates Summary Message: Creates a new assistant message with summary: true flag
2. Uses Summarization Prompt: Uses session/prompt/summarize.txt template asking for detailed summary
3. Streams the Summary: Generates a concise summary of the conversation focusing on:
   - What was done
   - What is currently being worked on
   - Which files are being modified
   - What needs to be done next
How Summaries are Served in Chat:
1. As Assistant Messages: Summary appears as a new assistant message with summary: true
2. Synthetic Parts: The summary message may contain synthetic: true text parts that are filtered out from display
3. Message Filtering: UI components filter out synthetic: true parts from display (see packages/ui/src/components/message-part.tsx)
4. Session-Level Summary: Also updates session-level summary with file diffs and statistics
Key Files:
- session/compaction.ts - Main compaction logic and overflow detection
- session/summary.ts - Session and message-level summarization
- session/prompt/summarize.txt - Summarization prompt template
- server/server.ts - Provides API endpoints for triggering summarization and managing session summaries
I'll focus on the server-side implementation of summarization endpoints. The server/server.ts file contains critical routes for initiating and retrieving session summaries. These endpoints enable both automatic and manual summarization processes, allowing flexible session management through programmatic interfaces.
The key server-side mechanisms include:
- Automatic overflow-triggered summarization
- Manual summarization via REST API
- Efficient message and session summary retrieval
- Support for different summary types and granularities
Based on my analysis of the codebase, here's how the session compaction/summarization system works:
Logic Behind Compaction/Summarization
Automatic Triggering
1. Token Overflow Detection (session/compaction.ts:33-41):
   - System monitors token usage during message processing
   - Triggers when: tokens.input + tokens.cache.read + tokens.output > (context - output_limit)
   - Checked in session/prompt.ts before each AI response
2. Manual Triggering:
   - Via /session/:id/summarize POST endpoint (server/server.ts:691-726)
   - Supports slash commands like /sammurize
How Compaction Works
1. Creates Summary Message (session/compaction.ts:111-134):
   - New assistant message with summary: true flag
   - Parent attached to last user message
   - Marked as summary type for tracking
2. Summarization Process (session/compaction.ts:147-179):
   - Uses session/prompt/summarize.txt template
   - Asks AI to summarize: "what was done, what we're doing, files being worked on, what to do next"
   - Streams summary as it's generated
3. Automatic Pruning (session/compaction.ts:50-88):
   - Prunes old tool calls (over 40k tokens) to make room
   - Protects recent conversation context
How Summaries are Served in Chat
1. As Assistant Messages:
   - Summary appears as new assistant message with summary: true
   - Displayed in chat thread like normal responses
2. Synthetic Parts with Filtering:
   - Summary messages contain synthetic: true text parts
   - UI filters these out from display (packages/ui/src/components/message-part.tsx:25)
   - Only actual summary content shown to user
3. Session-Level Summary (session/summary.ts:47-53):
   - Updates session metadata with diff stats
   - Stores file changes, additions/deletions
   - Available for UI but not injected as chat message
Key Insight
The /sammurize slash command triggers the same compaction process as automatic overflow, but on-demand. The summary appears as an assistant message in the chat thread, while synthetic parts are filtered out during rendering.
