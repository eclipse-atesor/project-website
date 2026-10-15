---
title: Change the docs
description: Where the Atesor documentation pages live, how to view a change on your computer, and the writing rules that each page follows.
sidebar:
  order: 6
---

The Eclipse Atesor™ documentation is a set of Markdown pages in the repository of the project website. This page tells you where the pages are, how to view a change on your computer, and which writing rules apply to each page.

## Where are the pages?

The website repository is [eclipse-atesor/project-website](https://github.com/eclipse-atesor/project-website). The documentation pages are in `site/src/content/docs/docs/`. Each folder is one section of the sidebar, and each file is one page:

| File | URL |
| --- | --- |
| `site/src/content/docs/docs/guides/sandboxes.md` | `/atesor/docs/guides/sandboxes/` |
| `site/src/content/docs/docs/contributing/docs.md` | `/atesor/docs/contributing/docs/` |

The sections are `introduction`, `getting-started`, `guides`, `architecture`, `reference`, `contributing` and `project`. Each page also has an edit link that opens its source file on GitHub.

## How do you view a change on your computer?

1. Clone the repository:

   ```bash
   git clone https://github.com/eclipse-atesor/project-website
   cd project-website/site
   ```

2. Install the packages and start the local server:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:4321/atesor/docs/ in a browser. The server shows each saved change.
4. Run `npm run build` to check that the full site builds.
5. Open a pull request on GitHub.

Maintainers publish the site with `npm run deploy`.

## What is in the page header?

Each page starts with frontmatter with exactly these keys:

```yaml
---
title: Install Atesor
description: One sentence, 160 characters or fewer, that says what the page is about.
sidebar:
  order: 2
---
```

- `title` is the page title. Do not repeat it as a `#` heading.
- `description` is one sentence of 160 characters or fewer.
- `sidebar.order` sets the position of the page in its folder.

## How is a page built?

- Use plain Markdown in a `.md` file. Do not use MDX, imports or components.
- Start the body with a short answer paragraph of 1 to 3 sentences. It says what the topic is and why a reader needs it. Search engines quote this paragraph, so it must make sense alone.
- Use `##` headings and lower levels. Phrase a heading as the question that a user asks, where it is natural.
- Give each code block a language tag: `bash`, `text`, `python`, `toml`, `json`, `markdown`, `dockerfile` or `yaml`.
- Use tables for reference data such as flags, environment variables and exit codes. Keep the cells short.
- Use the Starlight asides `:::note`, `:::tip`, `:::caution` and `:::danger`.
- Write internal links as absolute paths with the base and a trailing slash, for example `/atesor/docs/getting-started/install/`.
- Write external links as full `https` URLs. The source repository is `https://github.com/eclipse-atesor/atesor`. Never use `github.com/akifejaz/atesor-ai`, because that address returns 404.
- Write as much as the topic needs and no more. Reference pages can be long. A concept page has about 300 to 900 words.

## Which writing rules apply?

The pages use ASD-STE100 Simplified Technical English. The rules are:

- Use the active voice and name the actor: "Atesor clones the repository".
- Use simple tenses only: present, simple past and simple future.
- Write one instruction in each sentence. An instruction has 20 words or fewer. A description has 25 words or fewer.
- Do not stack more than 3 nouns. Use one word for one meaning, and do not change between synonyms.
- Keep the articles and the verbs. Do not drop words to save space.
- Use a numbered list for steps. Use a bulleted list for 3 or more conditions or items.
- Keep each paragraph on one topic, with 6 sentences or fewer.
- Define a technical term the first time that you use it, if it is not common English.
- Keep code, commands, flags, file paths, identifiers, log lines and error text exactly as they are in the code. Put them in backticks or code blocks.
- Use the plain voice of an engineer. Do not use marketing words, slogans, rhetorical questions in body text, exclamation marks or emojis.
- Do not use em dashes or en dashes. Use a colon, a comma, parentheses or a new sentence.

## How do you name the project?

- The first mention of the project in the body of a page is `Eclipse Atesor™`. After that, write `Atesor`.
- Do not write "ATESOR" or "Atesor AI" as the project name.
- The command and the package are `atesor-ai`, in code font.
- Write `RISC-V` for the architecture family. The architecture name in code and in tool output is `riscv64`.

## How do you keep a page correct?

1. Check each fact against the code on the `main` branch. Read the CLI flags in `main.py`, the environment variables with `grep -rn "getenv\|environ" src main.py`, the graph nodes and routing in `src/graph.py`, and the exit codes in `main.py`.
2. When the README and the code disagree, the code is correct. The architecture section of the README is out of date.
3. Do not add numbers that the code does not give. Do not write success rates, counts of ported packages or average times. You can use a count that you make from the code yourself, such as the number of graph nodes.
4. Do not write a fact that you cannot check.
5. Describe future behaviour only on the [Roadmap](/atesor/docs/project/roadmap/) page.
