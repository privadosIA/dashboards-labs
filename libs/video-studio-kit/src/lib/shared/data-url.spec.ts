import { blobToDataUrl, dataUrlToBlob, pictureFileName } from './data-url';

describe('data URLs', () => {
  it('turns a data URL into a file of its type and back', async () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    const blob = dataUrlToBlob(url);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(8);
    expect(await blobToDataUrl(blob)).toBe(url);
  });

  it('reads a data URL that is not base64', () => {
    expect(dataUrlToBlob('data:text/plain,hello%20you').size).toBe(9);
  });

  it('keeps the name of a picture and gives one an extension from its type otherwise', () => {
    expect(pictureFileName('photo.JPG', 'image/jpeg')).toBe('photo.JPG');
    expect(pictureFileName('photo', 'image/webp')).toBe('photo.webp');
    expect(pictureFileName('photo.heic', 'image/jpeg')).toBe('photo.jpg');
    expect(pictureFileName('', 'application/x')).toBe('image.png');
  });
});
