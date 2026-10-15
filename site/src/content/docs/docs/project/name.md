---
title: About the name
description: Atesor is the word Rosetta read right to left, with one t dropped. The page explains where the name comes from and what the logo shows.
sidebar:
  order: 4
---

The name Eclipse Atesor™ comes from Rosetta, read from right to left. Rosetta is the binary translator that Apple uses to run programs built for one processor architecture on another. Atesor has the same goal, a working program on a new architecture, but it takes the other route: it builds the program from source as native riscv64 code.

## Where does the name come from?

1. Start with `ROSETTA`.
2. Read it from right to left: `ATTESOR`.
3. Drop one `T`: `ATESOR`.

The project team chose to drop the second `t`. The result is a short name that is easy to say and to search for.

## Why right to left?

Rosetta is named after the Rosetta Stone. The stone carries one decree in three scripts: hieroglyphs, Demotic and Greek. In 1822 it helped Jean-François Champollion read Egyptian hieroglyphs.

The Egyptians usually wrote hieroglyphs from right to left. Signs of people and animals face the start of the line, so the reader knows the direction. When you read Rosetta in the same direction, you get Atesor.

## How is Atesor different from Rosetta?

| | Rosetta | Atesor |
| --- | --- | --- |
| Input | A compiled binary for another architecture | The source code of a package |
| Method | Translates machine code before or while the program runs | Builds the package natively on riscv64 and repairs build failures |
| Output | The same binary, translated on each machine | A native riscv64 binary and a recipe that anyone can replay |
| Lifetime | A transition aid: Apple limits Rosetta from macOS 28 | The native build stays valid |

Apple advises users to replace translated apps with native versions. Atesor does that work for RISC-V: it produces the native version.

## Is there a second meaning?

Yes. With one `t`, the name is close to the Spanish verb *atesorar*. The Real Academia Española defines it as "to gather and keep money or things of value". *Atesoro* means "I treasure".

Atesor keeps what it learns. Each verified port goes into the recipe cache, and each successful fix can become a few-shot example for later runs. See [Recipe cache](/atesor/docs/guides/recipe-cache/).

## What does the logo show?

The logo has three parts:

- **A stone with one cut corner.** It recalls the broken top of the Rosetta Stone. On a chip package, a cut corner also marks pin 1.
- **One line in three rows.** The line starts on the right and reverses direction on each row, like boustrophedon, an old way of writing where each line turns back. The three rows recall the three scripts on the stone. The 45-degree bends are the bends of a trace on a circuit board.
- **An open ring and a solid pad.** The line starts at an open ring, the source, and ends at a solid pad, the native riscv64 binary.

## Sources

- [Rosetta (software)](https://en.wikipedia.org/wiki/Rosetta_(software)), Wikipedia
- [Using Intel-based apps on a Mac with Apple silicon](https://support.apple.com/en-us/102527), Apple Support
- [Rosetta Stone](https://en.wikipedia.org/wiki/Rosetta_Stone) and [Egyptian hieroglyphs](https://en.wikipedia.org/wiki/Egyptian_hieroglyphs), Wikipedia
- [Boustrophedon](https://en.wikipedia.org/wiki/Boustrophedon), Wikipedia
- [atesorar](https://dle.rae.es/atesorar), Diccionario de la lengua española (RAE)

:::note
Rosetta is a product name of Apple Inc. Atesor is not related to Apple or to the Rosetta Stone language-learning products.
:::
