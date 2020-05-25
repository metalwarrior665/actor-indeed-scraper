const Apify = require('apify');
const urlParse = require('url-parse')

function makeUrlFull (href, urlParsed) {
    if (href.substr(0,1)==='/') return urlParsed.origin + href
    return href;
}

function getIdFromUrl (url) {
    console.log(url);
    return (url.match(new RegExp('(?<=jk=).*?$'))?url.match(new RegExp('(?<=jk=).*?$'))[0]:'')
}

Apify.main(async () => {
    const input = await Apify.getInput() || {};
    const { country, maxConcurrency, position, location } = input;
    const { startUrls, maxItems, extendOutputFunction, proxyConfiguration } = input;

    let extendOutputFunctionValid;
    if (extendOutputFunction) {
        try {
            extendOutputFunctionValid= eval(extendOutputFunction);
        } catch (e) {
            throw new Error(`extendOutputFunction is not a valid JavaScript! Error: ${e}`)
        }
        if (typeof extendOutputFunctionValid!== "function") {
            throw new Error(`extendOutputFunction is not a function! Please fix it or use just default output!`)
        }
    }

    console.log(`Running site crawl country ${country}, position ${position}, location ${location}`);

    let countryUrl = '';
    switch (country.toLowerCase()){
        case 'us':
            countryUrl = 'https://www.indeed.com';
            break;
        case 'uk':
        case 'gb':
            countryUrl = 'https://www.indeed.co.uk';
            break;
        case 'fr':
            countryUrl = 'https://www.indeed.fr';
            break;
        case 'es':
            countryUrl = 'https://www.indeed.es';
            break;
        case 'in':
            countryUrl = 'https://www.indeed.co.in';
            break;
        case 'br':
            countryUrl = 'https://www.indeed.com.br';
            break;
        case 'ca':
            countryUrl = 'https://www.indeed.ca';
            break;
        case 'nl':
            countryUrl = 'https://www.indeed.nl';
             break;
        case 'za':
            countryUrl = 'https://www.indeed.co.za';
            break;
        default:
            countryUrl = 'https://'+(country?country:'www')+'.indeed.com';
    }

    // Using startUrls disables search
    if (Array.isArray(startUrls) && startUrls.length > 0) {
        for (let req of startUrls) {
            if (!req.url) throw 'StartURL in bad format, needs to be object with url field'
            if (!req.userData) req.userData = {};
            if (!req.userData.label) req.userData.label = 'START';
            await requestQueue.addRequest(req);
        }
    } else {
        const startUrl = countryUrl + '/jobs?'+(position?'q='+encodeURIComponent(position)+'&':'')+(location?'l='+encodeURIComponent(location):'');

        const requestQueue = await Apify.openRequestQueue();
        await requestQueue.addRequest({url:startUrl,userData:{'label':'START'}});
    }

    var counter = 0;

    let proxyConf = {
        useApifyProxy : true
    };
    if (proxyConfiguration) proxyConf = proxyConfiguration;

    console.log('starting crawler')
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        //maxConcurrency : maxConcurrency,
        maxRequestRetries : 10,
        ...proxyConf,
        handlePageFunction: async ({ $, html, request }) => {
            console.log('url :',request.url);
            console.log('label :',request.userData.label);
            const urlParsed = urlParse(request.url);

            switch (request.userData.label){
                case 'START':
                case 'LIST':
                    const details = $('a[data-tn-element="jobTitle"]').get().map(function(el){return {url:makeUrlFull(el.attribs.href,urlParsed),userData:{'label':'DETAIL'}}});
                    for (const req of details) {
                        if (!(maxItems && counter>=maxItems)) await requestQueue.addRequest(req);
                        counter += 1;
                    }

                    const lists = $('div[class="pagination"] a').get().map(el => { return {url:makeUrlFull(el.attribs.href,urlParsed),userData:{'label':'LIST'}}});
                    for (const req of lists) {
                        if (!(maxItems && counter>maxItems)) await requestQueue.addRequest(req)
                    }

                    break;
                 case 'DETAIL':
                    let result = {
                        positionName : $('h3[class*="jobsearch-JobInfoHeader-title"]').text().trim(),
                        url : request.url,
                        id : getIdFromUrl($('meta[id="indeed-share-url"]').attr('content')),
                        location : $('span[class="jobsearch-JobMetadataHeader-iconLabel"]').eq(0).text().trim(),
                        description : $('div[id="jobDescriptionText"]').text()
                    };

                    if (extendOutputFunction){
                        try {
                            const userResult = await extendOutputFunctionValid($);
                            result = Object.assign(result,userResult);
                        } catch (e){
                            console.log('Error in the extendedOutputFunction run', e)
                        }
                    }

                   await Apify.pushData(result)

                break;
            }
        },
    });
    await crawler.run();

    console.log('Done.');
});
