## Requirements

`git-quick-stats`

## Workflow

1. Fetch list of repositories from <https://api.github.com/orgs/revoltchat/repos?type=source>
2. Clone full repository history locally
3. Use `git-quick-stats -T` to generate summary
4. Parse summary and map emails to Revolt IDs to generate contributions list
