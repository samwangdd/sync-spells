import { describe, expect, jest, test } from '@jest/globals';
import { copyText } from '../../webui/src/copyText';

describe('copyText', () => {
  test('writes the supplied skill name to the clipboard', async () => {
    const writeText = jest.fn<(text: string) => Promise<void>>().mockResolvedValue();

    await copyText('lark-review-invite', { writeText });

    expect(writeText).toHaveBeenCalledWith('lark-review-invite');
  });
});
