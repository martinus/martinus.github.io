---
author: martin.ankerl@gmail.com
comments: true
date: 2016-06-06 14:36:48+00:00
layout: post
slug: analyzing-keto-calculator-demographics
title: Analyzing Keto Calculator Demographics
wordpress_id: 1533
categories:
- programming
cover-img: /img/2016/06/age.png
---

Recently my [Keto Calculator](https://keto-calculator.ankerl.com/) has grown huge. So big, that in January 2016 alone I've had 222,781 page views. That is a record for my site, and I have no reason to believe that it will slow down anytime soon. In my quest to make all the visitors as happy as possible, I've done quite a bit of analysis of my visitors to find out what I need to do with my homepage. Here is some of the data that I have gathered using [Google Analytics](http://www.google.com/analytics/).

Each graph is color coded: _blue_ stands for mobile devices, _orange_ for tablets, and _green_ for desktops.


## Where Do the Users Come From?

I have created a bar chart showing the total number of sessions for January 2016, sorted by top countries.

![country](/img/2016/06/country.png) 

By far the most visitors come from the US, followed by Canada, UK, and Australia - all english speaking countries. The first non-english speaking country is Germany, and only with 0.69% of all sessions.

For fast access for the majority of my users, my hosting server should sit in the US. I have recently switched to [T1Hosting](https://t1hosting.com/aff.php?aff=49) which is both cheaper and faster than my previous webhoster. Also, they were really fast to respond to my questions. So far I am pretty happy with them!

Translation the calculator is currently not really useful. I am sure that translating it into German would increase the number of users from Germany, but it does not look like the effort would really be worth it. What I have done is add an automatic translation feature to the top of the calculator to provide some usability for non-English speakers. Unfortunately the quality is quite bad.

Almost half of my users come from mobile devices! To be precies, 48.8% mobile, 41.7% desktop, 9.5% tablets. That means it is absolutely essential that the keto calculator works well on mobile and on the desktop. It took me quite a while to make it look good on mobile, and now I'm happy with the result. I've done most of the testing with [Chrome DevTools](https://developer.chrome.com/devtools), which are absolutely fantastic!



## How Old Are My Visitors?

![age](/img/2016/06/age.png)

Most visitors are 25-34 years old. I guess that's a typical result for a website with nutrition as a topic. Interestingly, the graph does not show any data for younger than 18 year olds. I have updated the calculator with some safety checks so that even when somebody very young tries to use the calculator it will give reasonable advice. If you are under 18, it will show a warning. Under 15 the calculator even refuses to give you any results.


## What Gender Are My Visitors?

![gender](/img/2016/06/gender.png)

There are a lot more female visitors! It seems that females are much more sensitive about nutrition topics. Also, female tend to use more mobile devices.

It would probably help to have some gender specific advise on the keto calculator, especially for women. E.g. breastfeeding comes up from time to time. Unfortunately I know nothing about these topics, so it's best to go to the dedicated subreddit [/r/xxketo](https://www.reddit.com/r/xxketo) with these kind of questions. 


## How Big Are the Screens?

![resolution](/img/2016/06/resolution.png)

Lots of visitors use smartphones, and the screen resolutions reflect this. The sizes range from quite narrow with just 360 pixels to quite large with 1440 pixels. I've tuned the layout to be nicely visible on all these ranges. Thanks to [@media](https://developer.mozilla.org/en-US/docs/Web/CSS/@media) it gracefully switches between these layouts and looks quite readable on very wide screens and very small screens.
