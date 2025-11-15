import type { Message } from '@opencode-ai/sdk';

/**
 * Utility for detecting fresh messages that should be animated.
 * Uses a combination of message creation time and session tracking to determine
 * if a message is genuinely new (not just re-rendered).
 */
export class MessageFreshnessDetector {
    private static instance: MessageFreshnessDetector;
    private sessionStartTimes: Map<string, number> = new Map();
    private seenMessageIds: Set<string> = new Set();
    private messageCreationTimes: Map<string, number> = new Map();
    
    private constructor() {}
    
    static getInstance(): MessageFreshnessDetector {
        if (!MessageFreshnessDetector.instance) {
            MessageFreshnessDetector.instance = new MessageFreshnessDetector();
        }
        return MessageFreshnessDetector.instance;
    }
    
    /**
     * Record when a session starts to establish a baseline for message freshness.
     */
    recordSessionStart(sessionId: string): void {
        this.sessionStartTimes.set(sessionId, Date.now());
    }
    
    /**
     * RiCheckLine if a message should be considered fresh and eligible for animation.
     * A message is fresh if:
     * 1. It hasn't been seen before in this session
     * 2. It was created after the session started
     * 3. It's an assistant message (user messages don't animate)
     */
    shouldAnimateMessage(message: Message, sessionId: string): boolean {
        // Only animate assistant messages
        if (message.role !== 'assistant') {
            return false;
        }
        
        // Don't animate if we've already seen this message
        if (this.seenMessageIds.has(message.id)) {
            return false;
        }
        
        // Get session start time
        const sessionStartTime = this.sessionStartTimes.get(sessionId);
        
        // If we don't have session timing, don't animate - this prevents existing messages from animating
        // when a session is first loaded
        if (!sessionStartTime) {
            // Mark as seen so they don't animate when session timing is eventually set
            this.seenMessageIds.add(message.id);
            this.messageCreationTimes.set(message.id, message.time.created);
            return false;
        }
        
        // Message is fresh if created after session started (with 5 second buffer)
        const isFresh = message.time.created > (sessionStartTime - 5000);
        
        // Only mark as seen if it's not fresh - fresh messages will be marked as seen during animation
        if (!isFresh) {
            this.seenMessageIds.add(message.id);
            this.messageCreationTimes.set(message.id, message.time.created);
        }
        
        return isFresh;
    }
    
    /**
     * Clear session data when switching sessions or on cleanup.
     */
    clearSession(sessionId: string): void {
        this.sessionStartTimes.delete(sessionId);
        // Keep seen message IDs to prevent re-animation across session switches
        // but we could clear them if needed for memory management
    }
    
    /**
     * RiCheckLine if we have session timing recorded.
     */
    hasSessionTiming(sessionId: string): boolean {
        return this.sessionStartTimes.has(sessionId);
    }

    /**
     * RiCheckLine if a message has been animated.
     */
    hasBeenAnimated(messageId: string): boolean {
        return this.seenMessageIds.has(messageId);
    }

    /**
     * Mark a message as having been animated (should be called after animation completes).
     */
    markMessageAsAnimated(messageId: string, createdTime: number): void {
        this.seenMessageIds.add(messageId);
        this.messageCreationTimes.set(messageId, createdTime);
    }

    /**
     * Clear all data (useful for testing or memory cleanup).
     */
    clearAll(): void {
        this.sessionStartTimes.clear();
        this.seenMessageIds.clear();
        this.messageCreationTimes.clear();
    }
    
    /**
     * Get debug information about message freshness detection.
     */
    getDebugInfo(): {
        sessionStartTimes: Map<string, number>;
        seenMessageIds: Set<string>;
        messageCreationTimes: Map<string, number>;
    } {
        return {
            sessionStartTimes: new Map(this.sessionStartTimes),
            seenMessageIds: new Set(this.seenMessageIds),
            messageCreationTimes: new Map(this.messageCreationTimes)
        };
    }
}