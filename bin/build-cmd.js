
'use strict';

const fs = require('fs');
const util = require('util');
const needle = require('needle');
const AdmZip = require('adm-zip');
const path = require('path');

const fsp = {
    writeFile: util.promisify(fs.writeFile),
    unlink: util.promisify(fs.unlink)
};

const ZIP_FILE_PATH = './posts.zip';
const POSTS_DIR_PATH = 'posts/';
const POSTS_IMG_DIR_PATH = 'posts/images';
const POSTS_DRAFT_DIR_PATH = 'posts/draft';
const POSTS_TARGET_PATH = './source/_posts';
const POSTS_IMG_TARGET_PATH = './source/images';

const extractZip = function () {
    const zip = new AdmZip(ZIP_FILE_PATH);
    if (!fs.existsSync('./source/images')) {
        fs.mkdirSync('./source/images');
    }
    const tasks = zip.getEntries()
        .filter(entry =>
            !entry.isDirectory &&
            (entry.name.toLowerCase().endsWith('md') || entry.entryName.startsWith(POSTS_IMG_DIR_PATH)) &&
            entry.entryName.startsWith(POSTS_DIR_PATH) &&
            !entry.entryName.startsWith(POSTS_DRAFT_DIR_PATH)
        ).reduce((groups, entry) => {
            const key = entry.name.toLowerCase().endsWith('md') ? 0 : 1;
            groups[key].push(entry);
            return groups;
        }, [[], []])
        .map((group, index) => {
            let rootDir = POSTS_TARGET_PATH;
            if (index === 1) {
                rootDir = POSTS_IMG_TARGET_PATH;
            }
            return group.map(entry =>
                fsp.writeFile(
                    path.resolve(rootDir, entry.name.toLowerCase()),
                    entry.getData()
                )
            );
        }).reduce((arr, group) => {
            return arr.concat(group);
        }, []);
    return Promise.all(tasks).then(() => tasks.length);
};

const downloadZip = function () {
    return needle(
        'post',
        'https://content.dropboxapi.com/2/files/download_zip',
        {},
        {
            headers: {
                'Authorization': `Bearer ${process.env['DROPBOX_TOKEN']}`,
                'Dropbox-API-Arg': JSON.stringify({
                    'path': '/posts'
                }),
                'Content-Type': 'application/octet-stream; charset=utf-8'
            }
        }
    ).then(res => {
        if (res.statusCode !== 200) {
            throw new Error(`failed to download zip: ${res.body}`);
        }

        return fsp.writeFile(ZIP_FILE_PATH, res.body);
    });
};

const removePlaceHolderBlog = function (blogFileCount) {
    if (blogFileCount <= 0) {
        return Promise.resolve();
    }

    return fsp.unlink('./source/_posts/hello-world.md').catch(err => console.log(err));
};

const func = async function () {
    return downloadZip().then(extractZip).then(removePlaceHolderBlog);
};

func().then(() => process.exit(0)).catch(err => {
    console.log(err);
    process.exit(-1);
});