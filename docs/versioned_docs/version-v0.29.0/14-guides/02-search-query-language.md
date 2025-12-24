# Search Query Language

Karakeep provides a search query language to filter and find bookmarks. Here are all the supported qualifiers and how to use them:

## Basic Syntax

- Use spaces to separate multiple conditions (implicit AND)
- Use `and`/`or` keywords for explicit boolean logic
- Prefix qualifiers with `-` to negate them
- Use parentheses `()` for grouping conditions (note that groups can't be negated)

## Qualifiers

Here's a comprehensive table of all supported qualifiers:

| Qualifier                        | Description                                                                                                                                                                                               | Example Usage                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `is:fav`                         | Favorited bookmarks                                                                                                                                                                                       | `is:fav`                                     |
| `is:archived`                    | Archived bookmarks                                                                                                                                                                                        | `-is:archived`                               |
| `is:tagged`                      | Bookmarks that has one or more tags                                                                                                                                                                       | `is:tagged`                                  |
| `is:inlist`                      | Bookmarks that are in one or more lists                                                                                                                                                                   | `is:inlist`                                  |
| `is:link`, `is:text`, `is:media` | Bookmarks that are of type link, text or media                                                                                                                                                            | `is:link`                                    |
| `url:<value>`                    | Match bookmarks with URL substring                                                                                                                                                                        | `url:example.com`                            |
| `title:<value>`                  | Match bookmarks with title substring                                                                                                               | `title:example`                              |
|                                  | Supports quoted strings for titles with spaces                                                                                                   | `title:"my title"`                           |
| `#<tag>`                         | Match bookmarks with specific tag                                                                                                                                                                         | `#important`                                 |
|                                  | Supports quoted strings for tags with spaces                                                                                                                                                              | `#"work in progress"`                        |
| `list:<name>`                    | Match bookmarks in specific list                                                                                                                                                                          | `list:reading`                               |
|                                  | Supports quoted strings for list names with spaces                                                                                                                                                        | `list:"to review"`                           |
| `after:<date>`                   | Bookmarks created on or after date (YYYY-MM-DD)                                                                                                                                                           | `after:2023-01-01`                           |
| `before:<date>`                  | Bookmarks created on or before date (YYYY-MM-DD)                                                                                                                                                          | `before:2023-12-31`                          |
| `feed:<name>`                    | Bookmarks imported from a particular rss feed                                                                                                                                                             | `feed:Hackernews`                            |
| `age:<time-range>`               | Match bookmarks based on how long ago they were created. Use `<` or `>` to indicate the maximum / minimum age of the bookmarks. Supported units: `d` (days), `w` (weeks), `m` (months), `y` (years). | `age:<1d` `age:>2w` `age:<6m` `age:>3y` |

### Examples

```plaintext
# Find favorited bookmarks from 2023 that are tagged "important"
is:fav after:2023-01-01 before:2023-12-31 #important

# Find archived bookmarks that are either in "reading" list or tagged "work"
is:archived and (list:reading or #work)

# Find bookmarks that are not tagged or not in any list
-is:tagged or -is:inlist
# Find bookmarks with "React" in the title
title:React
```

## Combining Conditions

You can combine multiple conditions using boolean logic:

```plaintext
# Find favorited bookmarks from 2023 that are tagged "important"
is:fav after:2023-01-01 before:2023-12-31 #important

# Find archived bookmarks that are either in "reading" list or tagged "work"
is:archived and (list:reading or #work)

# Find bookmarks that are not favorited and not archived
-is:fav -is:archived
```

## Text Search

Any text not part of a qualifier will be treated as a full-text search:

```plaintext
# Search for "machine learning" in bookmark content
machine learning

# Combine text search with qualifiers
machine learning is:fav
```
