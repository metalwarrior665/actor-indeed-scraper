const Apify = require('apify');
const urlParse = require('url-parse')

function makeUrlFull(href,urlParsed){
    if (href.substr(0,1)==='/') return urlParsed.origin + href
    return href;
}

function getIdFromUrl(url){
    console.log(url);
    return (url.match(new RegExp('(?<=jk=).*?$'))?url.match(new RegExp('(?<=jk=).*?$'))[0]:'')
}

Apify.main(async () => {
    const input = await Apify.getInput() || {};
    const { state, maxConcurrency, position, location  } = input;
    const {startUrls, maxItems, extendOutputFunction, proxyConfiguration} = input;

    let extendOutputFunctionValid;
    if (extendOutputFunction){
        try {
            extendOutputFunctionValid= eval(extendOutputFunction);
        } catch (e) {
            throw new Error(`extendOutputFunction is not a valid JavaScript! Error: ${e}`)
        }
    }

    console.log(`Running site crawl state ${state}, position ${position}, location ${location}`);
    
    const startUrl = 'https://' + (state?state+'.':'www.') + 'indeed.com/jobs?'+(position?'q='+encodeURIComponent(position)+'&':'')+(location?'l='+encodeURIComponent(location):'');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({url:startUrl,userData:{'label':'START'}});

    if (startUrls){
        for (let sU of startUrls){
            if (!sU.url) throw 'StartURL in bad format, needs to be object with url field'
            if (!sU.userData) sU.userData = {};
            if (!sU.userData.label) sU.userData.label = 'START';
            await requestQueue.addRequest(sU);
        }
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
                        positionName : $('div[class="jobsearch-DesktopStickyContainer"]>h3').text().trim(),
                        url : request.url,
                        id : getIdFromUrl($('meta[id="indeed-share-url"]').attr('content')),
                        location : $('span[class="jobsearch-JobMetadataHeader-iconLabel"]').eq(0).text().trim(),
                        description : $('div[id="jobDescriptionText"]').text()
                    };

                    if (extendOutputFunction){
                        try {
                            const userResult = await extendOutputFunction($);
                            result = Object.asign(result,userResult);
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
