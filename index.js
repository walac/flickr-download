const Flickr = require('flickr-sdk');
const bluebird = require('bluebird');
const fs = bluebird.promisifyAll(require('fs'));
const rimraf = require('rimraf');
const promiseRetry = require('promise-retry');
const got = require('got');
const path = require('path');

const USER_ID = '147549424@N07';

class PhotosetDownloader {
  constructor() {
    this.flickr = new Flickr(process.env.FLICKR_API_KEY);
    this.userId = USER_ID;
  }

  async _processSet(s) {
    const result = await promiseRetry(retry => this.flickr.photosets.getPhotos({
      user_id: this.userId,
      photoset_id: s.id,
      page: 1,
      per_page: 4000,
    }).catch(retry));

    const albumName = s.title._content;

    if (fs.existsSync(albumName)) {
      await new Promise((accept, reject) => rimraf(albumName, err => {
        err && reject(err);
        accept();
      }));
    }

    await fs.mkdirAsync(albumName);

    const photos = JSON.parse(result.text).photoset.photo;

    for (let photo of photos) {
      await this._downloadPhoto(albumName, photo);
    }
  }

  async _downloadPhoto(basePath, photo) {
    const result = await promiseRetry(retry => this.flickr.photos.getSizes({photo_id: photo.id}).catch(retry));
    const sizes = JSON.parse(result.text).sizes.size;
    const url = sizes.filter(sz => sz.label === 'Original')[0].source;
    const filename = path.join(basePath, `${photo.id}${path.extname(url)}`);
    console.log(`Downloading ${filename} from ${url}`);
    await promiseRetry(retry => {
      const out = fs.createWriteStream(filename);
      const inp = got.stream(url);
      return new Promise((accept, reject) => {
        out.once('error', reject);
        inp.once('error', reject);
        out.on('finish', accept);
        inp.pipe(out);
      }).catch(retry);
    });
  }

  async download() {
    const sets = await this.flickr.photosets.getList({
      user_id: this.userId,
      page: 1,
      per_page: 4000,
    });

    const photoset = JSON.parse(sets.text).photosets.photoset;

    for (let set of photoset) {
      await this._processSet(set);
    }
  }
}

function main() {
  const downloader = new PhotosetDownloader();
  downloader.download().catch(err => console.log(err.stack));
}

main();
