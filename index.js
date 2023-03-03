#!/usr/bin/env node
const redis = require('redis');
const cheerio = require('cheerio');
const request = require('request-promise');
const axios = require('axios');
const fs = require('fs');
const { pseudoRandomBytes } = require('crypto');

const REDIS_PREFIX = 'vc'
const REDIS_SORTED_SET = 'vcsortedset'
const REDIS_EXPIRE_TIME = 60 * 60 * 24

async function initRedis() {
  const client = redis.createClient();
  client.on('error', err => console.log('Redis Client Error', err));
  await client.connect();
  await client.set('key', 'value', 'EX', REDIS_EXPIRE_TIME);
  const value = await client.get('key');
  return client
}

main()

async function main() {
  const redisClient = await initRedis()
  redisClient.del(REDIS_SORTED_SET)
  try {
    const response = await axios.get('https://www.vnexpress.net');
    const $ = cheerio.load(response.data);
    const title = $('title').text()
    console.log('title: ', title)

    // 1. Craw Main website, filter duplicate data
    // const categories = getCategories($)
    const posts = getPosts($)
    // console.log('posts', posts)

    // 2. Craw categories, posts, save word map to redis
    for (const post of posts) {
      const pageContent = await crawPost(post.href)
      const wordFrequencyMap = countWordFrequency(pageContent)
      for (const [key, value] of Object.entries(wordFrequencyMap)) {
        // await redisClient.set(genRedisKey(key), value, 'EX', REDIS_EXPIRE_TIME);
        if (key === '') {
          continue
        }
        const i = await redisClient.zAdd(REDIS_SORTED_SET, [{ score: value, value: key }])
      }
    }

    // 3. Export redis data to file output.txt
    fs.truncate('./output.txt', 0, function () {})
    for await (const s of redisClient.zScanIterator(REDIS_SORTED_SET)) {
      console.log('s', s)
      // const word = s.value.replace('vc:', '')
      // fs.writeFile('output.txt', `${word} ${s.score}\n`, {flag: 'a'}, err => {
      //   if (err) {
      //     console.error(err);
      //   }
      // });
    }


  } catch (error) {
    console.error(error);
  }

  await redisClient.disconnect()
}

async function crawPost(postUrl) {
  try {
    const response = await axios.get(postUrl);
    const $ = cheerio.load(response.data);
    const title = $('title').text()
    const shortDescription = $('section.page-detail div.sidebar-1 p.description').text()
    let description = ''
    const paragraphs = $('article.fck_detail p.Normal')
    paragraphs.each(function () {
      description += $(this).text() + " "
    })
    return title + shortDescription + description
  } catch (error) {
    console.error(error);
  }

  return ''
}

function countWordFrequency(string) {
  let words = string.replace(/[.,;\-0-9\(\)\/\"\']/g, '').split(/\s/);
  words.forEach((w, i) => words[i] = words[i].toLowerCase())
  var freqMap = {};
  words.forEach(function (w) {
    if (!freqMap[w]) {
      freqMap[w] = 0;
    }
    freqMap[w] += 1;
  });

  return freqMap;
}

function genRedisKey(key) {
  return REDIS_PREFIX + ':' + key
}

const getCategories = function($) {
  const categoryElements = $('#wrap-main-nav .main-nav li a')
  const categories = []
  categoryElements.each(function () {
    if ($(this).prop('href') != '/' &&
      $(this).prop('href') != 'javascript:;' &&
      $(this).prop('href') != 'https://video.vnexpress.net'
    ) {
      categories.push({ 'href': 'https://www.vnexpress.net' + $(this).prop('href'), 'title': $(this).prop('title') })
    }
  })

  return categories
}

const getPosts = function($) {
  const postElements = $('article a')
  let posts = []
  // postElements.each(function () {
  //   posts.push({ 'href': $(this).prop('href'), 'title': $(this).prop('title') })
  // })
  for (let i=0; i<1; i++) {
    posts.push({ 'href': $(postElements[i]).prop('href'), 'title': $(postElements[i]).prop('title') })
  }

  // filter duplicated posts
  posts = posts.filter((value, index, self) =>
    index === self.findIndex((t) => (
      t.href === value.href
    ))
  )

  return posts
}
