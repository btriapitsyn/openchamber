export type QuestionAnswer = string[];

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: {
    messageID: string;
    callID: string;
  };
}

export interface QuestionAskedEvent {
  type: 'question.asked';
  properties: QuestionRequest;
}

export interface QuestionRepliedEvent {
  type: 'question.replied';
  properties: {
    sessionID: string;
    requestID: string;
    answers: QuestionAnswer[];
  };
}

export interface QuestionRejectedEvent {
  type: 'question.rejected';
  properties: {
    sessionID: string;
    requestID: string;
  };
}
