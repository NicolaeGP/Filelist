let request = require("request-promise");
const cheerio = require('cheerio');
const decompress = require('brotli/decompress');
const fs = require('fs');

request = request.defaults({
    jar: request.jar(),
    headers: {
        "Connection": "keep-alive",
        "Cache-Control": "max-age=0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Origin": "https://filelist.ro",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.8,ro;q=0.6"
    },
    followAllRedirects: false,
    followRedirect: false,
    simple: false
});

class FileList {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.baseUrl = "https://filelist.ro";
        this.textDecoder = new TextDecoder("utf-8");
    }

    async loginAsync() {
        return request.post(this.baseUrl + "/takelogin.php", {
            headers: {
                Referer: this.baseUrl + "/login.php?returnto=%2F",
            },
            formData: {
                username: this.username,
                password: this.password
            },
            resolveWithFullResponse: true,
        });
    }

    async getLoginPageAsync() {
        return request.get(this.baseUrl + "/login.php", {
            resolveWithFullResponse: true
        });
    }

    async getTorrentzAsync(query) {
        let page = 0;
        let hasResults = true;
        let torrentz = [];

        //this can be optimized to run in paralel but it's not needed and might cause throttling
        //remove the await and add the processing of the request in then of the request
        //return a list of promises and use promise.all
        while (hasResults) {
            let response = await request.get(this.baseUrl + "/browse.php", {
                resolveWithFullResponse: true,
                headers: {
                    "Referer": this.baseUrl + "/browse.php",
                },
                qs: {
                    search: query,
                    cat: 16,
                    searchin: 0,
                    sort: 0,
                    page: page
                },
                encoding: null,
                resolveWithFullResponse: true
            })

            const decompressedBody = decompress(response.body);
            const decompressedBodyString = this.textDecoder.decode(decompressedBody);
            const body = cheerio.load(decompressedBodyString);
            const torrentRows = body(".torrentrow");
            if (torrentRows.length === 0)
                hasResults = false;
            else {
                torrentRows.each((key, item) => {
                    let title = body(".torrenttable:nth-child(2) a", item).attr("title");
                    let details = body(".torrenttable:nth-child(2) a", item).attr("href");
                    torrentz.push({ title, details });
                });
                page++;
            }
        }
        return torrentz;
    }

    async getDetailsAsync(torrentRelUrl) {
        return request.get(this.baseUrl + "/" + torrentRelUrl, {
            resolveWithFullResponse: true,
            headers: {
                "Referer": this.baseUrl + "/browse.php",
            },
            encoding: null,
            resolveWithFullResponse: true
        }).then(response => {
            const decompressedBody = decompress(response.body);
            const decompressedBodyString = this.textDecoder.decode(decompressedBody);
            const body = cheerio.load(decompressedBodyString);
            return body('tt').text();
        });
    }
}

async function RunCode(expression, query) {
    // #region loginDetails
    const fl = new FileList([username], [password]);
    // #endregion

    let regex = RegExp(expression, "i");
    try {
        // const loginpage = await fl.getLoginPageAsync();
        const loginResponse = await fl.loginAsync();
        const allTorrentz = await fl.getTorrentz(query);
        const filteredTorrentz = allTorrentz.filter((t) => regex.test(t.title));
        const sortedTorrentz = filteredTorrentz.sort((a, b) => (a.title.length > b.title.length) ? 1 : ((a.title.length < b.title.length) ? -1 : ((a.title > b.title) ? 1 : ((a.title < b.title) ? -1 : 0))));

        let data= '';

        for (const torrent of sortedTorrentz) {
            let details = await fl.getDetails(torrent.details);
            data+= torrent.title + "\n" + details+"\n \n";
        }

        fs.appendFileSync('Overview.txt', data);

    } catch (error) {
        console.log(error);
    }
}

RunCode("^ELearning\.Pack\.\\d{1,}$", 'elearning pack');