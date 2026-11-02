import {z} from 'zod';
// Untrusted wire data. Version changes require a separate parser/verifier.
export const submission=z.object({
 runId:z.string().uuid(),version:z.literal(1),generator:z.literal(1),inputFormat:z.literal(1),
 endTick:z.number().int().min(1).max(5400),
 inputs:z.array(z.number().int().min(0).max(5399)).max(600)
}).strict().refine(v=>v.inputs.every((n,i)=>i===0||n>v.inputs[i-1]),'Wejścia muszą być rosnące.');
export type RunSubmission=z.infer<typeof submission>;
