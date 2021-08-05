export interface ResourceUrlParsed {
  fullUrl: string;
  commitSha: string;
}

export const urlToParsed = (input: {
  importUrl: string;
  importName: string;
}): ResourceUrlParsed => {
  const { importUrl, importName } = input;
  const regexToFindSha = new RegExp(`(?<=${importName}/.*?).*(?=/)`, "g");

  const searchResults = importUrl
    .match(regexToFindSha)
    ?.filter((x) => x.length > 0);

  const commitSha = searchResults && searchResults[0];

  if (!commitSha) {
    throw new Error(`could not derive commitSha from this url: ${importUrl}`);
  }

  return {
    fullUrl: importUrl,
    commitSha,
  };
};
