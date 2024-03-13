import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { MeetingEndedEvent } from './types';

describe('validation of hook payload', () => {
  test('test payload should fail validation', async () => {
    const errors = await validate(
      plainToClass(MeetingEndedEvent, { test: 'test' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
