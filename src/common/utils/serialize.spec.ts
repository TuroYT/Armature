import { Expose } from 'class-transformer';
import { serialize } from './serialize.js';

class UserDto {
  @Expose() id!: string;
  @Expose() email!: string;
}

describe('serialize', () => {
  it('strips fields not decorated with @Expose()', () => {
    const result = serialize(UserDto, {
      id: 'abc',
      email: 'test@example.com',
      passwordHash: '$2b$12$secret',
    });

    expect(result.id).toBe('abc');
    expect(result.email).toBe('test@example.com');
    expect((result as Record<string, unknown>)['passwordHash']).toBeUndefined();
  });

  it('works with arrays', () => {
    const result = serialize(UserDto, [
      { id: '1', email: 'a@example.com', passwordHash: 'x' },
      { id: '2', email: 'b@example.com', passwordHash: 'y' },
    ]) as unknown as UserDto[];

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(
      (result[0] as Record<string, unknown>)['passwordHash'],
    ).toBeUndefined();
  });

  it('returns a class instance', () => {
    const result = serialize(UserDto, { id: '1', email: 'test@example.com' });
    expect(result).toBeInstanceOf(UserDto);
  });
});
