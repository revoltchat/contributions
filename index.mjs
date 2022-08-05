import { mkdir, readdir, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { simpleGit } from 'simple-git';
import { existsSync } from 'fs';
import { resolve } from 'path';

import contributors from './contributors.json' assert { type: 'json' };

const ORG = 'revoltchat';
const COMMUNITY_REPOS = [
    'mutiny',
    'revolt.py',
    'rvmob',
    'themes',
    'translations'
];

const flag = process.argv[2];
if (!flag && !(flag === '--fetch' || flag === '--generate')) {
    console.info('Specify either --fetch or --generate.');
    process.exit(0);
}

// 1. Fetch list of repositories
if (flag === '--fetch') {
    const list = await fetch(`https://api.github.com/orgs/${ORG}/repos?type=source`)
        .then(res => res.json())
        .then(list => list.map(({ name }) => ({ name, path: resolve('repos', name) })));

    // 2. Clone or update repositories
    for (const { name, path } of list) {
        if (existsSync(path)) {
            await simpleGit(path)
                .pull();
        } else {
            await mkdir(path);
            await simpleGit('repos')
                .clone(`https://github.com/${ORG}/${name}.git`);
        }
    }
}

// 3. Generate and parse summary
let total = 0;
const contributions_by_email = {};
for (const name of await readdir('repos')) {
    if (name === '.gitkeep') continue;
    if (COMMUNITY_REPOS.includes(name)) continue;

    const stats = execSync('git-quick-stats -T', { cwd: resolve('repos', name) }).toString();
    const RE_CONTRIBUTIONS = /\n\n\s+([^]+?)<([^]+?)>[^]+?lines changed: (\d+)/gm;

    let match;
    while (match = RE_CONTRIBUTIONS.exec(stats)) {
        const email = match[2],
              value = parseInt(match[3]);

        if (contributors.ignore.includes(email)) continue;
        contributions_by_email[email] = (contributions_by_email[email] || 0) + value;
        total += value;
    }
}

// 4. Collect into email addresses
const entries = Object
    .keys(contributions_by_email)
    .map(email => ({ email, contributions: contributions_by_email[email] }))
    .sort((a,b)=>b.contributions-a.contributions);

// 5. Map to Revolt IDs
const unclaimed = [],
      mapped    = {};

entries
    .map(({ email, contributions }) => ({ email, id: contributors.ids[email], contributions }))
    .forEach(({ email, id, contributions }) => {
        if (id) {
            if (!mapped[id]) mapped[id] = 0;
            mapped[id] += contributions;
        } else {
            unclaimed.push(email);
        }
    });

// 6. Sort again
const output_claimed = Object
    .keys(mapped)
    .map(id => ({ id, contributions: mapped[id], info: contributors.info[id], team: contributors.team.includes(id) }))
    .filter(({ info }) => info)
    .sort((a,b)=>b.contributions-a.contributions);

// 7. Write to files
await Promise.all([
    writeFile('generated_contrib.json', JSON.stringify(output_claimed, null, '\t')),
    writeFile('generated_unclaimed.json', JSON.stringify(unclaimed, null, '\t')),
]);

// 8. Generate README
const FILE = `# Contributors

Below is a table of contributions by users.

| Name | Contributions |   |   |
|------|:-------------:|:-:|---|
${output_claimed
    .map(({ info, contributions }) => `|${info.link
        ? `[${info.name}](${info.link})`
        : info.name}|${contributions}|(${(contributions / total * 100).toFixed(2)}%)|${info.github
            ? `[GitHub](https://github.com/${info.github})`
            : ''}`)
    .join('\n')}

If you would like to list your contributions, please edit [contributors.json](https://github.com/revoltchat/contributions/blob/master/contributors.json) and add the corresponding information.
`;

await writeFile('README.md', FILE);
