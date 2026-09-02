import { IsString, Length } from 'class-validator';

export class AskQuestionDto {
    // Bounded before any provider call: an empty or oversized question is
    // rejected by validation and never consumes free-tier quota.
    @IsString()
    @Length(3, 500)
    question!: string;
}
