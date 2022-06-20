const Apify = require('apify');

const { COUNTRY_DICT } = require('./constants');

const { log } = Apify.utils;

const makeUrlFull = (href, urlParsed) => {
    if (href.substr(0, 1) === '/') return urlParsed.origin + href;
    return href;
};

const getIdFromUrl = (url) => {
    return url.match(new RegExp('(?<=jk=).*?$'))
        ? url.match(new RegExp('(?<=jk=).*?$'))[0]
        : '';
};

const fromStartUrls = async function* (startUrls, name = 'STARTURLS') {
    const rl = await Apify.openRequestList(name, startUrls);
    /** @type {Apify.Request | null} */
    let rq;
    // eslint-disable-next-line no-cond-assign
    while ((rq = await rl.fetchNextRequest())) {
        yield rq;
    }
};

const checkMaxItemsInput = (maxItems) => {
    if (maxItems > 990) {
        log.warning(
            `The limit of items you set exceeds maximum allowed value. Max possible number of offers, that can be processed is 990.`
        );
    } else if (maxItems === undefined) {
        log.info(`no maxItems value. Set it to 990 (max)`);
        maxItems = 990;
    }

    return maxItems;
};

const buildStartUrl = async ({ requestQueue, position, location, country, startUrls, currentPageNumber }) => {
    // Using startUrls => disables search
    const countryUrl =
        COUNTRY_DICT[country.toLowerCase()] ||
        `https://${country || 'www'}.indeed.com`;
    if (Array.isArray(startUrls) && startUrls.length > 0) {
        for await (const req of fromStartUrls(startUrls)) {
            // this line changed
            if (!req.url)
                throw 'StartURL in bad format, needs to be object with url field';
            if (!req.userData) req.userData = {};
            if (!req.userData.label) req.userData.label = 'START';
            req.userData.currentPageNumber = currentPageNumber;
            if (req.url.includes('viewjob')) req.userData.label = 'DETAIL';
            if (!req.url.includes('&sort=date')) req.url = `${req.url}&sort=date`; // with sort by date there is less duplicates in LISTING
            await requestQueue.addRequest(req);
            log.info(`This url will be scraped: ${req.url}`);
        }
    } // IF NO START URL => CREATING FIRST "LIST" PAGE ON OUR OWN
    else {
        log.info(`Running site crawl country ${country}, position ${position}, location ${location}`);
        const startUrl = `${countryUrl}/jobs?${position ? `q=${encodeURIComponent(position)}&sort=date` : ''}${location
            ? `&l=${encodeURIComponent(location)}` : ''}`;

        await requestQueue.addRequest({
            url: startUrl,
            userData: {
                label: 'START',
                currentPageNumber,
            },
        });
    }
};

module.exports = {
    makeUrlFull,
    getIdFromUrl,
    fromStartUrls,
    checkMaxItemsInput,
    buildStartUrl,
};
