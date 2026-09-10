import { z } from 'zod';

export const funasrProtocolSchema = z.enum(['python', 'cpp-2pass', 'cpp-offline']);
export type FunasrProtocol = z.infer<typeof funasrProtocolSchema>;
