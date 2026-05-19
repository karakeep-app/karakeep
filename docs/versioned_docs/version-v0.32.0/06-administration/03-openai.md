# Tagging Costs

This service uses OpenAI for automatic tagging. This means that you'll incur some costs if automatic tagging is enabled. There are two type of inferences that we do:

## Text Tagging

For text tagging, we use the `gpt-4.1-mini` model. This model is [extremely cheap](https://openai.com/api/pricing). Cost per inference varies depending on the content size per article. Though, roughly, You'll be able to generate tags for almost 3000+ bookmarks for less than $1.

## Image Tagging

For image uploads, we use the `gpt-4o-mini` model for extracting tags from the image. You can learn more about the costs of using this model [here](https://platform.openai.com/docs/guides/images?api-mode=chat#calculating-costs). To lower the costs, we're using the low resolution mode (fixed number of tokens regardless of image size). You'll be able to run inference for 1000+ images for less than a $1.
