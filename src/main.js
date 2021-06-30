const Apify = require('apify');
const urlParse = require('url-parse');

const {
    log
} = Apify.utils;

function makeUrlFull(href, urlParsed) {
    if (href.substr(0, 1) === '/') return urlParsed.origin + href;
    return href;
}

function getIdFromUrl(url) {
    return (url.match(new RegExp('(?<=jk=).*?$')) ? url.match(new RegExp('(?<=jk=).*?$'))[0] : '');
}

// ADD URLS FROM INPUT
const fromStartUrls = async function* (startUrls, name = 'STARTURLS') {
    const rl = await Apify.openRequestList(name, startUrls);
    /** @type {Apify.Request | null} */
    let rq;
    // eslint-disable-next-line no-cond-assign
    while (rq = await rl.fetchNextRequest()) {
        yield rq;
    }
};

Apify.main(async () => {
    const input = await Apify.getInput() || {};
    const {
        country,
        maxConcurrency,
        position,
        location,
        startUrls,
        maxItems,
        extendOutputFunction,
        proxyConfiguration = {
            useApifyProxy: true
        },
    } = input;


    if (maxItems > 990) {
        log.warn(`The limit of items you set exceeds maximum allowed value. Max possible number of offers, that can be processed is 990.`)
    }
    // EXTENDED FUNCTION FROM INPUT
    let extendOutputFunctionValid;
    if (extendOutputFunction) {
        try {
            extendOutputFunctionValid = eval(extendOutputFunction);
        } catch (e) {
            throw new Error(`extendOutputFunction is not a valid JavaScript! Error: ${e}`);
        }
        if (typeof extendOutputFunctionValid !== 'function') {
            throw new Error('extendOutputFunction is not a function! Please fix it or use just default output!');
        }
    }

    const countryDict = {
        us: 'https://www.indeed.com',
        uk: 'https://www.indeed.co.uk',
        gb: 'https://www.indeed.co.uk',
        fr: 'https://www.indeed.fr',
        es: 'https://www.indeed.es',
        in: 'https://www.indeed.co.in',
        br: 'https://www.indeed.com.br',
        ca: 'https://www.indeed.ca',
        nl: 'https://www.indeed.nl',
        za: 'https://www.indeed.co.za',
    };
    const countryUrl = countryDict[country.toLowerCase()] || `https://${country || 'www'}.indeed.com`;
    // COUNTER OF ITEMS TO SAVE 
    let itemsCounter = 0;

    const requestQueue = await Apify.openRequestQueue();
    // IF THERE ARE START URLS => ADDING THEM TO THE QUEUE
    // Using startUrls => disables search
    if (Array.isArray(startUrls) && startUrls.length > 0) {
        for await (const req of fromStartUrls(startUrls)) { // this line changed
            if (!req.url) throw 'StartURL in bad format, needs to be object with url field';
            if (!req.userData) req.userData = {};
            if (!req.userData.label) req.userData.label = 'START';
            req.userData.itemsCounter = itemsCounter;
            if (req.url.includes("viewjob")) req.userData.label = 'DETAIL'
            await requestQueue.addRequest(req);
            log.info(`This url will be scraped: ${req.url}`);
        }

    }
    // IF NO START URL => CREATING FIRST "LIST"  PAGE ON OUR OWN
    else {
        log.info(`Running site crawl country ${country}, position ${position}, location ${location}`);
        const startUrl = `${countryUrl}/jobs?${position ? `q=${encodeURIComponent(position)}&` : ''}${location ? `l=${encodeURIComponent(location)}` : ''}`;
        await requestQueue.addRequest({
            url: startUrl,
            userData: {
                label: 'START',
                itemsCounter: itemsCounter,
            }
        });
    }

    const sdkProxyConfiguration = await Apify.createProxyConfiguration(proxyConfiguration);

    // You must use proxy on the platform
    if (Apify.getEnv().isAtHome && !sdkProxyConfiguration) {
        throw 'You must use Apify Proxy or custom proxies to run this scraper on the platform!';
    }

    log.info('Starting crawler...');
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useSessionPool: true,
        sessionPoolOptions: {
            maxPoolSize: 50,
            sessionOptions: {
                maxUsageCount: 50,
            },
        },
        maxConcurrency,
        maxRequestRetries: 15,
        proxyConfiguration: sdkProxyConfiguration,
        handlePageFunction: async ({ $, request, session, response }) => {
            log.info(`Label(Page type): ${request.userData.label} || URL: ${request.url}`);
            const urlParsed = urlParse(request.url);

            if (![200, 404].includes(response.statusCode)) {
                session.retire();
                request.retryCount--;
                throw new Error(`We got blocked by target on ${request.url}`);
            }

            switch (request.userData.label) {
                case 'START':
                case 'LIST':
                    let itemsCounter = request.userData.itemsCounter;
                    log.info(`Number of processed offers: ${itemsCounter}`);

                    const details = $('.tapItem').get().map((el) => {
                        return {
                            url: makeUrlFull(el.attribs.href, urlParsed),
                            userData: {
                                label: 'DETAIL'
                            }
                        };
                    });

                    for (const req of details) {
                        if (!(maxItems && itemsCounter >= maxItems) && itemsCounter < 990) await requestQueue.addRequest(req);
                        itemsCounter += 1;
                    }

                    const nextPage = $('a[aria-label="Next"]').attr('href');
                    const nextPageUrl = {
                        url: makeUrlFull(nextPage, urlParsed),
                        userData: {
                            label: 'LIST',
                            itemsCounter: itemsCounter,
                        }
                    };

                    if (!(maxItems && itemsCounter > maxItems) && itemsCounter < 990) await requestQueue.addRequest(nextPageUrl);

                    break;
                case 'DETAIL':
                    let result = {
                        positionName: $('.jobsearch-JobInfoHeader-title').text().trim(),
                        company: $(".jobsearch-JobInfoHeader-subtitle > div > div").eq(0).text(),
                        location: $(".jobsearch-JobInfoHeader-subtitle > div").eq(1).text(),
                        reviews: $(".jobsearch-JobInfoHeader-subtitle > div > div").eq(1).text().replace(/\D/g, ''),
                        url: request.url,
                        id: getIdFromUrl($('meta[id="indeed-share-url"]').attr('content')),
                        description: $('div[id="jobDescriptionText"]').text(),
                    };

                    if (extendOutputFunction) {
                        try {
                            const userResult = await extendOutputFunctionValid($);
                            result = Object.assign(result, userResult);
                        } catch (e) {
                            log.info('Error in the extendedOutputFunction run', e);
                        }
                    }

                    await Apify.pushData(result);

                    break;
                default:
                    throw new Error(`Unknown label: ${request.userData.label}`);
            }
        }
    });
    await crawler.run();

    log.info('Done.');
});