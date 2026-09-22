## Connect in about two minutes

You need three things:

1. **Your Jira site**, like `your-team.atlassian.net`.
2. **An API token** from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens). Use **Create API token**, not the "with scopes" option.
3. **Your project key** (the `ABC` in `ABC-123`) or your own JQL.

JiraPlay checks the login and the query with Jira before saving. The token is kept in your system keychain and only ever sent to your Atlassian site, so every change is made as you.
