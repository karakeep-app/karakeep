# PikaPods

:::info
Note: PikaPods shares some of its revenue from hosting Karakeep with the maintainer of this project.
:::

[PikaPods](https://www.pikapods.com/) offers managed paid hosting for many open source apps, including Karakeep.
Server administration, updates, migrations and backups are all taken care of, which makes it well suited
for less technical users. As of Nov 2024, running Karakeep there will cost you ~$3 per month.

### Requirements

- A _PikaPods_ account. Can be created for free [here](https://www.pikapods.com/register). You get an initial welcome credit of $5.

### 1. Choose app

Choose _Karakeep_ from their [list of apps](https://www.pikapods.com/apps) or use this [direct link](https://www.pikapods.com/pods?run=karakeep). This will either
open a new dialog to add a new _Karakeep_ pod or ask you to log in.

### 2. Add settings

There are a few settings to configure in the dialog:

- **Basics**: Give the pod a name and choose a region that's near you.
- **Env Vars**: Here you can disable signups or set an OpenAI API key. All settings are optional.
- **Resources**: The resources your _Karakeep_ pod can use. The defaults are fine, unless you have a very large collection.

### 3. Start pod and add user

After hitting _Add pod_ it will take about a minute for the app to fully start. After this you can visit
the pod's URL and add an initial user under _Sign Up_. After this you may want to disable further sign-ups
by setting the pod's `DISABLE_SIGNUPS` _Env Var_ to `true`.
