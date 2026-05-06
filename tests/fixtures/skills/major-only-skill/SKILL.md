---
name: major-only-skill
description: Helps with stuff related to data processing.
---

# Major Only

This skill basically just simply processes data. You should use it when you need to process data, or really, anytime data processing is what you need.

## When to use

Just use it whenever you have data and you basically need to do something with it. It's pretty simply the right tool for processing tasks of a general nature.

## How it works

It processes the data and returns the result. Internally, it just simply runs the data through the standard pipeline and basically gives back what you'd expect.

The pipeline does its thing — that's basically it.

## Example

Pretty simple — pass data in, get processed data out:

```python
result = process(data)
print(result)
```

That's basically the whole flow.

## Configuration

You can configure it via the standard configuration mechanism. Just set the options you want and it'll basically respect them. The defaults are usually fine.

## Edge cases

- Empty data: it just returns an empty result.
- Bad data: it basically does its best and returns whatever it can.
- Very large data: it just simply chunks things and processes them.
