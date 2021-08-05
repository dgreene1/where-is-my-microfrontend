export interface ResourceUrlParsed {
  fullUrl: string;
  commitSha: string | null;
}

export const urlToParsed = (input: {
  importUrl: string;
  importName: string;
}): ResourceUrlParsed => {
  const { importUrl, importName } = input;
  const regexToFindSha = new RegExp(
    `(?<=${importName}/.*?).*(?=.*?/${importName})`,
    "g"
  );

  const searchResults = importUrl
    .match(regexToFindSha)
    ?.filter((x) => x.length > 0);

  return {
    fullUrl: importUrl,
    commitSha: searchResults ? searchResults[0] : null,
  };
};
