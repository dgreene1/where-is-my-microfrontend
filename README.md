# where-is-my-microfrontend

A tool to help you to keep your microfrontend deployments up-to-date

# Limitations

1. At this time it only supports repositories stored in Github

# Assumptions

1. All of your microfrontends live in the same [owner/organization](https://docs.github.com/en/organizations) (i.e. they're all under github.com/my-special-owner/\*)

# Usage

# Security

This will never share your password/token and it has protections put in place to ensure that your credentials are anonymized before (if) ever being written to the console.

In order to set your username and password, have the following environment variables set:

| Environment Key Name | Type   | Meaning                                                                                                                                                                                                                         |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WIMMFE_USERNAME      | string | the username who has access to the repos you want to check                                                                                                                                                                      |
| WIMMFE_PASSWORD      | string | this is where you provide the [token](https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/creating-a-personal-access-token) (if it's a private repo) or the password if it's public |
