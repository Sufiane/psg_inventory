import { describe, expect, it } from 'vitest';
import { percent } from './format';

describe('percent', () => {
    describe('when the fraction is positive', () => {
        it('shows one decimal with an explicit plus sign', () => {
            expect(percent(0.125).replace(/\s/g, ' ')).toBe('+12,5 %');
        });
    });

    describe('when the fraction is negative', () => {
        it('shows a minus sign and one decimal', () => {
            const text = percent(-0.5).replace(/\s/g, ' ');

            expect(text).toMatch(/^[-−]50,0 %$/);
        });
    });

    describe('when the fraction is 0', () => {
        it('shows no sign', () => {
            expect(percent(0).replace(/\s/g, ' ')).toBe('0,0 %');
        });
    });
});
