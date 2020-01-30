let request = require("request-promise");
const cheerio = require('cheerio');
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
        "Accept-Encoding": "gzip",
        "Accept-Language": "en-US,en;q=0.8,ro;q=0.6"
    },
    followAllRedirects: false,
    followRedirect: false,
    simple: false,
    gzip: true
});

class FileList {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.baseUrl = "https://filelist.ro";
        this.textDecoder = new TextDecoder("utf-8");
        this.validator = "";
    }

    async loginAsync() {
        return await request.post(this.baseUrl + "/takelogin.php", {
            headers: {
                Referer: this.baseUrl + "/login.php?returnto=%2F",
            },
            formData: {
                validator: this.validator,
                username: this.username,
                password: this.password,
                returnto: "%2F"
            },
            resolveWithFullResponse: true,
        });
    }

    async setValidator() {
        return request.get(this.baseUrl + "/login.php", {
            resolveWithFullResponse: true
        }).then(response => {
            const body = cheerio.load(response.body);
            this.validator = body("input[name='validator']").attr('value');
        });
    }

    async getTorrentzAsync(query, cat, searchin, sort) {
        let page = 0;
        let hasResults = true;
        let torrentz = [];

        //this can be optimized to run in paralel but it's not needed and might cause throttling
        //remove the await and add the processing of the request in then of the request
        //return a list of promises and use promise.all
        //best case scenario you can make x number of requests because you must check if there are still results in the response. hasResults must be set to false somewhere
        while (hasResults) {
            let response = await request.get(this.baseUrl + "/browse.php", {
                resolveWithFullResponse: true,
                headers: {
                    "Referer": this.baseUrl + "/browse.php",
                },
                qs: {
                    search: query,
                    cat: cat,
                    searchin: searchin,
                    sort: sort,
                    page: page
                },
                encoding: null,
                resolveWithFullResponse: true
            })
            const body = cheerio.load(response.body);
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

    async getDetailsAsync(torrentRelUrl, torrentTitle) {
        return request.get(this.baseUrl + "/" + torrentRelUrl, {
            resolveWithFullResponse: true,
            headers: {
                "Referer": this.baseUrl + "/browse.php",
            },
            encoding: null,
            resolveWithFullResponse: true
        }).then(response => {
            const body = cheerio.load(response.body);
            let data = body('tt').text() === "" ? body('.quote').text() : body('tt').text();
            return torrentTitle + "\n" + data;
        });
    }

    async getCategoriesAsync() {
        let response = await request.get(this.baseUrl + "/browse.php", {
            resolveWithFullResponse: true,
            headers: {
                "Referer": this.baseUrl + "/browse.php",
            },
            encoding: null,
            resolveWithFullResponse: true
        })
        let categories = [];
        const body = cheerio.load(response.body);
        const selector = body('select[name="cat"]');
        selector.children().each((key, option) => {
            let name = option.firstChild.nodeValue;
            let value = option.attribs.value;
            categories.push({ name, value })
        })
        return categories;
    }
}

async function RunCode(expression, query) {
    // #region loginDetails
    const fl = new FileList('[username]', '[password]');
    // #endregion

    let regex = RegExp(expression, "i");
    try {
        await fl.setValidator();
        const loginResponse = await fl.loginAsync();
        const categories = await fl.getCategoriesAsync();
        const docsCat = categories.find((cat) => cat.name.includes('Docs'));
        const allTorrentz = await fl.getTorrentzAsync(query, docsCat.value, 1, 2);
        const filteredTorrentz = allTorrentz.filter((t) => regex.test(t.title));
        const sortedTorrentz = filteredTorrentz.sort((a, b) => (a.title.length > b.title.length) ? 1 : ((a.title.length < b.title.length) ? -1 : ((a.title > b.title) ? 1 : ((a.title < b.title) ? -1 : 0))));

        let data = '';

        let detailsRequests = sortedTorrentz.map(torrent => fl.getDetailsAsync(torrent.details, torrent.title));
        const resolvedPromises = await Promise.all(detailsRequests);

        resolvedPromises.forEach(details => {
            data += details + "\n \n";
        });


        fs.appendFileSync('Overview.txt', data);
    } catch (error) {
        console.log(error);
    }
}

RunCode("^ELearning\.Pack\.\\d{1,}$", 'elearning pack');