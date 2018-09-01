# Actions

Although you can [`.create()` and `.update()` records](./CRUD.md) anywhere in your app, it's recommended to **define model Actions** to encapsulate all ways to modify records.

## Defining actions

An **action** is just a method defined on a `Model` class. For example:

```js
class Post extends Model {
  // ...
  
  async addComment(body, author) {
    return await this.collections.get('comments').create(comment => {
      comment.post.set(this)
      comment.author.set(author)
      comment.body = body
    })
  }
}
```

**Note:**

- Always mark actions as `async` and remember to `await` on `.create()` and `.update()`
- You can use `this.collections` to access `Database.collections`

**Another example**: updater action on `Comment`:

``js
class Comment extends Model {
  // ...
  @field('is_spam') isSpam
  
  async markAsSpam() {
    await this.update(comment => {
      comment.isSpam = true
    })
  }
}
```

Now we can create a comment and immediately mark it as spam:

```js
const comment = await post.addComment('Lorem ipsum', someUser)
await comment.markAsSpam()
```

## Batch updates

Whenever you make more than one change (create or update records) in an action, you should **batch them**.

> It means that the app doesn't have to go back and forth with the database (sending one command, waiting for the response, then sending another), but instead sends multiple commands in one big batch. This is faster, safer, and can avoid subtle bugs in your app

Take an action that changes a `Post` into spam:

```js
class Post extends Model {
  // ...
  async createSpam() {
    await this.update(post => {
      post.title = `7 ways to lose weight`
    })
    await this.collections.get('comments').create(comment => {
      comment.post.set(this)
      comment.body = "Don't forget to comment, like, and subscribe!"
    })
  }
}
```

Let's modify it to use batching:

```js
class Post extends Model {
  // ...
  async createSpam() {
    await this.batch(
      this.prepareUpdate(post => {
        post.title = `7 ways to lose weight`
      }),
      this.collections.get('comments').prepareCreate(comment => {
        comment.post.set(this)
        comment.body = "Don't forget to comment, like, and subscribe!"
      })
    )
  }
}
```

**Note**:

- Call `await this.batch` in the Action (outside of actions, you can also call `.batch()` [on the `Database` object](./CRUD.md))
- Pass the list of **prepared operations** as arguments:
  - Instead of calling `await record.update()`, pass `record.prepareUpdate()` — note lack of `await`
  - Instead of `await collection.create()`, use `collection.prepareCreate()`
- Otherwise, the API is the same!

## Delete action

query.deleteAll

## Pro-tips

Validation with invariant

Fast skip

kwargs

* * *

## Next steps

➡️ Now that you've mastered all basics of Watermelon, go create some powerful apps — or keep reading [**advanced guides**](./README.md)
