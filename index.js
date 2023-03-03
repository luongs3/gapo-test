#!/usr/bin/env node
const cheerio = require('cheerio')
const request = require('request-promise')
const {program} = require('commander');
const axios = require('axios');
const fs = require('fs');
const {pseudoRandomBytes} = require('crypto');

program
  .arguments('<url> <maxDepth>')
  .action(async (url, maxDepth) => {
    const wordMap = {}
    const visited = new Set()
    const queue = [{ url, depth: 0 }]
    let counter = 0

    console.log('Crawling: ', url);
    while (queue.length > 0) {
      const { url, depth } = queue.shift();
      if (visited.has(url)) continue
      visited.add(url)
      console.log(`${counter}-${depth}: ${url}`);
      counter++
      if (depth > Number(maxDepth)) continue

      try {
        const response = await axios.get(url)
        const $ = cheerio.load(response.data)
        updateWordMap($, wordMap)
        if (depth < maxDepth) {
          $('a').each((i, link) => {
            const href = $(link).attr('href');
            if (href && href.startsWith('http') && !visited.has(href)) {
              queue.push({ url: href, depth: depth + 1 })
            }
          })
        }
      } catch (error) {
        console.error(error);
      }
      // await delay(200)
    }

    exportFile(wordMap)
    console.log('\nDone!')
  })
program.parse(process.argv)


function updateWordMap($, wordMap) {
  console.log('text: ', $('body').text());
  let words = $('body').text().replace(/[.,\-0-9\(\)\/\"\']/g, '')
    .toLowerCase()
    .split(/\s/)
  words.forEach(function (w) {
    if (w !== '') {
      if (!wordMap[w]) {
        wordMap[w] = 0
      }
      wordMap[w] += 1
    }
  })
}

function exportFile(wordMap) {
  fs.truncate('./output.txt', 0, function () {})
  const output = Object.entries(wordMap)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => `${word} ${count}`)
    .join('\n')

  fs.writeFile('output.txt', output, err => {
    if (err) {
      console.error(err)
    }
  })
}

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}
