# where-is-my-microfrontend

A tool to help you to keep your microfrontend deployments up-to-date

# Limitations

1. At this time it only supports repositories stored in Github

# Assumptions

1. All of your microfrontends live in the same [owner/organization](https://docs.github.com/en/organizations) (i.e. they're all under github.com/my-special-owner/\*)

# Usage

_TBD_

# Security

This will never share your Github [personal access token](https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/creating-a-personal-access-token) and it has protections put in place to ensure that your credentials are anonymized before (if) ever being written to the console.

In order to set your token, create a file next to where you're running this app that is called `"env.local"` with the following inside:

```
WIMFME_GITHUB_PAT=whateverTheValueIsOfYourToken
```
