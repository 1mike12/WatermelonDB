# Changelog

## Unreleased

### BREAKING CHANGES

### New features

- [Query] `Q.on` queries are now far more flexible. Previously, they could only be placed at the top
    level of a query. See Docs for more details. Now, you can:

     - Pass multiple conditions on the related query, like so:

        ```js
        collection.query(
          Q.on('projects', [
            Q.where('foo', 'bar'),
            Q.where('bar', 'baz'),
          ])
        )
        ```
     - You can place `Q.on` deeper inside the query (nested inside `Q.and()`, `Q.or()`). However, you
        must explicitly list all tables you're joining on at the beginning of a query, using:
        `Q.experimentalJoinTables(['join_table1', 'join_table2'])`.
     - You can nest `Q.on` conditions inside `Q.on`, e.g. to make a condition on a grandchild.
          To do so, it's required to pass `Q.experimentalNestedJoin('parent_table', 'grandparent_table')` at the beginning
          of a query
- [Query] `Q.unsafeSqlExpr()` and `Q.unsafeLokiExpr()` are introduced to allow adding bits of queries
    that are not supported by the WatermelonDB query language without having to use `unsafeFetchRecordsWithSQL()`.
    See docs for more details
- [Query] `Q.unsafeLokiFilter((rawRecord, loki) => boolean)` can now be used as an escape hatch to make
    queries with LokiJSAdapter that are not otherwise possible (e.g. multi-table column comparisons).
    See docs for more details

### Changes

- [Performance] [LokiJS] Improved performance of queries containing query comparisons on LokiJSAdapter
- [Docs] Added Contributing guide for Query language improvements
- [Deprecation] `Query.hasJoins` is deprecated
- [DX] Queries with bad associations now show more helpful error message
- [Query] Counting queries that contain `Q.experimentalTake` / `Q.experimentalSkip` is currently broken - previously it would return incorrect results, but
    now it will throw an error to avoid confusion. Please contribute to fix the root cause!

### Fixes

- [Typescript] Fixed types of Relation

### Internal

- `QueryDescription` structure has been changed.
