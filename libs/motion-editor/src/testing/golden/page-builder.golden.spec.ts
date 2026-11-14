// Pins the browser's page builder to a page the server wrote. See `golden/page/README.md` for the files the owner drops there.
// Until they are there this is a `todo`: it is listed in `ESTADO.md` as pending, not skipped silently.
describe('the page of a scene', () => {
  it.todo('equals the page the server wrote for the same scene, after whitespace normalisation (needs golden/page/page.html and its inputs)');
  it.todo('is built from the same song slice the server wrote (needs golden/page/song-slice.json)');
});
