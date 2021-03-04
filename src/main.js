const Apify = require('apify');
const urlParse = require('url-parse');

function makeUrlFull(href, urlParsed) {
    if (href.substr(0, 1) === '/') return urlParsed.origin + href;
    return href;
}

function getIdFromUrl(url) {
    console.log(url);
    return (url.match(new RegExp('(?<=jk=).*?$')) ? url.match(new RegExp('(?<=jk=).*?$'))[0] : '');
}

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
        proxyConfiguration = { useApifyProxy: true },
    } = input;

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

    const requestQueue = await Apify.openRequestQueue();

    // Using startUrls disables search
    if (Array.isArray(startUrls) && startUrls.length > 0) {
        for (const req of startUrls) {
            if (!req.url) throw 'StartURL in bad format, needs to be object with url field';
            if (!req.userData) req.userData = {};
            if (!req.userData.label) req.userData.label = 'START';
            if (req.url.includes("viewjob")) req.userData.label = 'DETAIL'
            await requestQueue.addRequest(req);
            console.log(`This url will be scraped: ${req.url}`);
        }
        
    } else {
        console.log(`Running site crawl country ${country}, position ${position}, location ${location}`);

        const startUrl = `${countryUrl}/jobs?${position ? `q=${encodeURIComponent(position)}&` : ''}${location ? `l=${encodeURIComponent(location)}` : ''}`;

        await requestQueue.addRequest({ url: startUrl, userData: { label: 'START' } });
    }


    let counter = 0;
    const sdkProxyConfiguration = await Apify.createProxyConfiguration(proxyConfiguration);

    // You must use proxy on the platform
    if (Apify.getEnv().isAtHome && !sdkProxyConfiguration) {
        throw 'You must use Apify Proxy or custom proxies to run this scraper on the platform!';
    }

    console.log('starting crawler');
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
        maxRequestRetries: 10,
        proxyConfiguration: sdkProxyConfiguration,
        handlePageFunction: async ({ $, request, session, response }) => {
            console.log('url :', request.url);
            console.log('label :', request.userData.label);
            const urlParsed = urlParse(request.url);

            if (![200, 404].includes(response.statusCode)) {
                session.retire();
                request.retryCount--;
                throw new Error(`We got blocked by target on ${request.url}`);
            }

            switch (request.userData.label) {
                case 'START':
                case 'LIST':
                    const details = $('a[data-tn-element="jobTitle"]').get().map((el) => { return { url: makeUrlFull(el.attribs.href, urlParsed), userData: { label: 'DETAIL' } }; });
                    for (const req of details) {
                        if (!(maxItems && counter >= maxItems)) await requestQueue.addRequest(req);
                        counter += 1;
                    }

                    const lists = $('div[class="pagination"] a').get().map((el) => { return { url: makeUrlFull(el.attribs.href, urlParsed), userData: { label: 'LIST' } }; });
                    for (const req of lists) {
                        if (!(maxItems && counter > maxItems)) await requestQueue.addRequest(req);
                    }

                    break;
                case 'DETAIL':
                    let result = {
                        positionName: $('.jobsearch-JobInfoHeader-title').text().trim(),
                        company: $(".jobsearch-JobInfoHeader-subtitle > div > div").eq(0).text(),
                        location: $(".jobsearch-JobInfoHeader-subtitle > div").eq(1).text(),
                        reviews: $(".jobsearch-JobInfoHeader-subtitle > div > div").eq(1).text().replace(/\D/g,''),
                        url: request.url,
                        id: getIdFromUrl($('meta[id="indeed-share-url"]').attr('content')),
                        description: $('div[id="jobDescriptionText"]').text(),
                    };

                    if (extendOutputFunction) {
                        try {
                            const userResult = await extendOutputFunctionValid($);
                            result = Object.assign(result, userResult);
                        } catch (e) {
                            console.log('Error in the extendedOutputFunction run', e);
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

    console.log('Done.');
});
