import React from 'react';
import {
  RiGitBranchLine,
  RiMore2Line,
  RiSettings3Line,
  RiSparklingLine,
  RiAttachment2,
  RiAtLine,
  RiGlobalLine,
  RiImage2Line,
  RiFileLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { cn } from '@/lib/utils';
import { ProviderLogo } from '@/components/ui/ProviderLogo';

// Types for mock data
interface AgentSession {
  id: string;
  modelName: string;
  providerId: string;
  additions: number;
  deletions: number;
}

interface MockMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  activities?: MockActivity[];
}

interface MockActivity {
  type: 'explored' | 'read' | 'file' | 'command';
  label: string;
  detail?: string;
  isNew?: boolean;
  commandOutput?: string;
  status?: 'success' | 'error';
}

// Mock data for the agent run
const MOCK_AGENT_SESSIONS: AgentSession[] = [
  { id: 'agent-1', modelName: 'Auto', providerId: 'anthropic', additions: 54, deletions: 0 },
  { id: 'agent-2', modelName: 'Auto', providerId: 'anthropic', additions: 41, deletions: 1 },
];

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Check if the server returns 404s on not found api requests',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Checking the server setup for 404 handling on not found API requests. Examining the main app file and error handling middleware.',
    activities: [
      { type: 'explored', label: '3 files' },
    ],
  },
  {
    id: 'msg-3',
    role: 'assistant',
    content: 'Checking route files for 404 handling and searching for tests that verify this behavior:',
    activities: [
      { type: 'explored', label: '1 file', detail: '2 searches' },
    ],
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content: 'Checking for tests that verify 404s on non-existent API routes:',
    activities: [
      { type: 'explored', label: '2 searches' },
    ],
  },
  {
    id: 'msg-5',
    role: 'assistant',
    content: 'Creating a test to verify 404 handling for non-existent API routes:',
    activities: [
      { type: 'explored', label: '1 directory', detail: '1 file' },
    ],
  },
  {
    id: 'msg-6',
    role: 'assistant',
    content: 'Creating a test to verify 404 handling for non-existent API routes, then fixing if needed:',
    activities: [
      { type: 'file', label: 'api.404.spec.ts', isNew: true },
      { 
        type: 'command', 
        label: 'cd, npm test',
        commandOutput: `$ cd /home/explainingrobotics/.cursor/worktrees/quadcoach/saj/server && npm test -- api.404.spec.ts

> quadcoach@1.0.0 test
> jest --runInBand api.404.spec.ts

sh: 1: jest: not found`,
        status: 'success'
      },
    ],
  },
  {
    id: 'msg-7',
    role: 'assistant',
    content: 'Checking package.json for test scripts:',
    activities: [
      { type: 'read', label: 'package.json' },
    ],
  },
  {
    id: 'msg-8',
    role: 'assistant',
    content: 'Analyzing the code: the catch-all route in app.ts returns HTML for unmatched routes, including API routes. Adding middleware to return 404 JSON for unmatched API routes before the catch-all:',
    activities: [
      { type: 'read', label: 'app.ts' },
    ],
  },
  {
    id: 'msg-9',
    role: 'assistant',
    content: 'Planning next moves',
  },
];

interface AgentSessionTabProps {
  session: AgentSession;
  isSelected: boolean;
  onSelect: () => void;
}

const AgentSessionTab: React.FC<AgentSessionTabProps> = ({ session, isSelected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex-1 min-w-0 flex flex-col gap-0.5 px-3 py-2 rounded-lg border transition-colors text-left',
        isSelected 
          ? 'bg-primary/10 dark:bg-primary/15 border-primary/30' 
          : 'bg-background/50 border-border/30 hover:bg-background/80 hover:border-border/50'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="typography-ui-label text-foreground truncate">{session.modelName}</span>
        <RiSparklingLine className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
      </div>
      <div className="flex items-center gap-1.5 typography-micro">
        <span className="text-green-500 dark:text-green-400">+{session.additions}</span>
        {session.deletions > 0 && (
          <span className="text-red-500 dark:text-red-400">-{session.deletions}</span>
        )}
      </div>
    </button>
  );
};

interface ActivityItemProps {
  activity: MockActivity;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity }) => {
  if (activity.type === 'explored') {
    return (
      <div className="typography-meta text-muted-foreground">
        Explored <span className="text-foreground">{activity.label}</span>
        {activity.detail && <span> {activity.detail}</span>}
      </div>
    );
  }
  
  if (activity.type === 'read') {
    return (
      <div className="typography-meta text-muted-foreground">
        Read <span className="text-foreground font-mono text-xs">{activity.label}</span>
      </div>
    );
  }
  
  if (activity.type === 'file') {
    return (
      <div className="flex items-center gap-2 typography-meta">
        <span className="text-blue-500 dark:text-blue-400 font-mono text-xs">ts</span>
        <span className="text-foreground font-mono text-xs">{activity.label}</span>
        {activity.isNew && (
          <span className="text-muted-foreground">(new)</span>
        )}
      </div>
    );
  }
  
  if (activity.type === 'command') {
    return (
      <div className="mt-2 rounded-lg border border-border/50 bg-neutral-900/50 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
          <span className="typography-meta text-muted-foreground">
            Ran command: <span className="text-foreground">{activity.label}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" className="p-1 hover:bg-accent/20 rounded">
              <RiFileLine className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
        {activity.commandOutput && (
          <div className="p-3 font-mono text-xs text-foreground/90 whitespace-pre-wrap overflow-x-auto">
            <span className="text-green-400">$</span>{' '}
            <span className="text-blue-400">cd</span>{' '}
            <span className="text-yellow-400">/home/explainingrobotics/.cursor/worktrees/quadcoach/saj/server</span>{' '}
            <span className="text-foreground/60">&&</span>{' '}
            <span className="text-blue-400">npm</span>{' '}
            <span className="text-foreground">test</span>{' '}
            <span className="text-foreground/60">--</span>{' '}
            <span className="text-cyan-400">api.404.spec.ts</span>
            {'\n\n'}
            <span className="text-foreground/70">&gt; quadcoach@1.0.0 test</span>
            {'\n'}
            <span className="text-foreground/70">&gt; jest --runInBand api.404.spec.ts</span>
            {'\n\n'}
            <span className="text-red-400">sh: 1: jest: not found</span>
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-background/30">
          <button type="button" className="typography-micro text-muted-foreground hover:text-foreground flex items-center gap-1">
            Use Allowlist <RiMore2Line className="h-3 w-3" />
          </button>
          {activity.status === 'success' && (
            <span className="typography-micro text-green-500 dark:text-green-400 flex items-center gap-1">
              ✓ Success
            </span>
          )}
        </div>
      </div>
    );
  }
  
  return null;
};

interface MockMessageItemProps {
  message: MockMessage;
}

const MockMessageItem: React.FC<MockMessageItemProps> = ({ message }) => {
  if (message.role === 'user') {
    return (
      <div className="bg-neutral-800/80 rounded-lg px-4 py-3 mb-4">
        <p className="typography-body text-foreground">{message.content}</p>
      </div>
    );
  }
  
  return (
    <div className="mb-4">
      <p className="typography-body text-foreground mb-2">{message.content}</p>
      {message.activities && message.activities.length > 0 && (
        <div className="space-y-1">
          {message.activities.map((activity, index) => (
            <ActivityItem key={index} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
};

interface AgentRunDetailProps {
  runId: string;
  title: string;
  branch: string;
  worktree: string;
  timestamp: string;
}

export const AgentRunDetail: React.FC<AgentRunDetailProps> = ({
  title,
  worktree,
  timestamp,
}) => {
  const [selectedAgentId, setSelectedAgentId] = React.useState(MOCK_AGENT_SESSIONS[1].id);
  
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/30 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="typography-heading-lg text-foreground truncate">{title}</h1>
            <div className="flex items-center gap-2 mt-1 typography-meta text-muted-foreground">
              <span>{timestamp}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <RiGitBranchLine className="h-3.5 w-3.5" />
                {worktree}
              </span>
              <span className="text-green-500 dark:text-green-400">+42</span>
              <span>·</span>
              <span>Auto</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <RiSettings3Line className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <RiMore2Line className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Agent Session Tabs */}
        <div className="flex gap-2 mt-4">
          {MOCK_AGENT_SESSIONS.map((session) => (
            <AgentSessionTab
              key={session.id}
              session={session}
              isSelected={selectedAgentId === session.id}
              onSelect={() => setSelectedAgentId(session.id)}
            />
          ))}
        </div>
      </div>
      
      {/* Chat History */}
      <ScrollableOverlay
        outerClassName="flex-1 min-h-0"
        className="px-4 py-4"
      >
        <div className="max-w-3xl mx-auto">
          {MOCK_MESSAGES.map((message) => (
            <MockMessageItem key={message.id} message={message} />
          ))}
        </div>
      </ScrollableOverlay>
      
      {/* Bottom Input Section */}
      <div className="flex-shrink-0 border-t border-border/30 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          {/* File indicator and actions */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="flex items-center gap-1.5 typography-meta text-muted-foreground hover:text-foreground">
              <span>&gt;</span>
              <span>1 File</span>
            </button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 typography-meta">
                Stop
                <span className="text-muted-foreground/60 text-xs">Ctrl+Shift+Q</span>
              </Button>
              <Button variant="outline" size="sm" className="h-7 typography-meta">
                Review
              </Button>
            </div>
          </div>
          
          {/* Input field */}
          <div className="relative">
            <div className="rounded-xl border border-border/50 bg-background/80 px-4 py-3">
              <input
                type="text"
                placeholder="Ask follow-ups in the worktree"
                className="w-full bg-transparent typography-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                disabled
              />
            </div>
          </div>
          
          {/* Footer with controls */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <button type="button" className="flex items-center gap-1.5 typography-meta text-muted-foreground hover:text-foreground">
                <span className="text-primary">∞</span>
                <span>Agent</span>
                <RiMore2Line className="h-3 w-3" />
              </button>
              <button type="button" className="flex items-center gap-1.5 typography-meta text-muted-foreground hover:text-foreground">
                <ProviderLogo providerId="anthropic" className="h-3.5 w-3.5" />
                <span>Auto</span>
                <RiMore2Line className="h-3 w-3" />
              </button>
              <button type="button" className="flex items-center gap-1 typography-meta text-muted-foreground hover:text-foreground">
                <RiGitBranchLine className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/20">
                <RiAtLine className="h-4 w-4" />
              </button>
              <button type="button" className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/20">
                <RiGlobalLine className="h-4 w-4" />
              </button>
              <button type="button" className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/20">
                <RiImage2Line className="h-4 w-4" />
              </button>
              <button type="button" className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/20">
                <RiAttachment2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
