var running = 0;
var start_time = new Date().getTime();
var li_extractor_data = [];
var total_pages = 0;
var email_address_results = "";
var max_num_search_pages = 5;
var liextractor_api_url = "";

chrome.storage.sync.get(null, function(items) {

    if (items['email_address_results']) {
        email_address_results = items['email_address_results'];
    }

    if (items['max_num_search_pages']) {
        max_num_search_pages = items['max_num_search_pages'];
    }

    if (items['liextractor_api_url']) {
        liextractor_api_url = items['liextractor_api_url'];
    }
});

function round(value, decimals) {
  return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

function get_domain(name, company_name) {
    console.log("sb2", name, company_name);
    $.ajax({
        type: 'GET',
        url: "https://autocomplete.clearbit.com/v1/companies/suggest?query="+company_name,
        success: function(output, status, xhr) {

            console.log("sb3", output);
            //Attempt to get domain for exact match first
            for(var i=0; i<output.length; i++) {
                if (output[i]['name'] == company_name) {
                    return scan_for_emails(name, output[i]['domain']);
                }
            }

            //Attempt to get domain for near match
            company_name = company_name.replace(" Inc.", "");
            company_name = company_name.replace(" Inc", "");
            company_name = company_name.replace("LLC", "");
            company_name = $.trim(company_name);
            for(var i=0; i<output.length; i++) {
                if (output[i]['name'] == company_name) {
                    return scan_for_emails(name, output[i]['domain']);
                }
            }

            //Screw it, let's just get the first result.
            for(var i=0; i<output.length; i++) {
                return scan_for_emails(name, output[i]['domain']);
            }
        },
        cache: false
    });
}

function scan_for_emails(name, domain) {
    var n = {
        "first_name": "",
        "first_initial": "",
        "last_name": "",
        "last_initial": "",
    };
    var possibilities = [
        "{fn}{ln}",
        "{fn}.{ln}",
        "{fi}{ln}",
        "{fn}",
        "{fn}{li}",
    ];

    var name_pieces = name.split(" ");
    n['first_name'] = name_pieces[0]
    n['first_initial'] = name_pieces[0][0]

    if (name_pieces.length > 1) {
        n['last_name'] = name_pieces[name_pieces.length-1].replace(".", "")
        n['last_initial'] = name_pieces[name_pieces.length-1][0]
    }

    var emails = [];
    for (var i=0; i<possibilities.length; i++) {
        var new_e = possibilities[i];
        new_e = new_e.replace("{fn}", n['first_name']);
        new_e = new_e.replace("{ln}", n['last_name']);
        new_e = new_e.replace("{fi}", n['first_initial']);
        new_e = new_e.replace("{li}", n['last_initial']);
        new_e = new_e + "@"+domain;
        emails.push(new_e.toLowerCase());
    }
    console.log("attempted emails...", emails);
    for(var i=0; i<emails.length; i++) {
        $.ajax({
            type: 'GET',
            url: "https://mail.google.com/mail/gxlu?email="+emails[i],
            success: function(output, status, xhr) {
                //results checked in background.js
            },
            cache: false
        });

        $.ajax({
            type: 'GET',
            url: "https://api.github.com/search/commits?q=committer-email:"+emails[i],
            beforeSend: function(xhr){
                xhr.setRequestHeader('Accept', 'application/vnd.github.cloak-preview');
            },
            current_email: emails[i],
            success: function(output, status, xhr) {
                if (output['total_count'] && output['total_count'] > 0) {
                    found_email(this.current_email, "github");
                }
            },
            cache: false
        });

        $.ajax({
            url:"http://viewdns.info/reversewhois/?q="+emails[i],
            type:'GET',
            current_email: emails[i],
            success: function(data){
                var domain_results = .split('Reverse Whois results for')[1].split('domains that matched this search query')[0].split('There are')[1].trim();
                domain_results = parseInt(domain_results);
                if (domain_results > 0) {
                    found_email(this.current_email, "DNS");
                }
            },
            cache: false
        });
    }

}

function get_profile_info() {
    var name = $.trim($('.pv-top-card-section__name').text());
    var company_name = $.trim($('.pv-top-card-section__company').text());
    console.log("sb1");
    get_domain(name, company_name);
}

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.trigger_extractor == "doit") {
        console.log("sb1 TRIGGERED");
        get_profile_info();
    }
    else if (request.found_email) {
        found_email(request.found_email, "gmail");
    }
});

function found_email(email, source) {
    alert("Found email: "+email+"\nSource: "+source);
}

function next_page_loaded() {
    console.log("Next page loaded check!");

    var is_loading = false;
    //Sales Navigator
    if (jQuery(".results-loader-wrapper").find('.results-loader:visible').length > 0) {
        is_loading = true;
    }
    //Normal LinkedIn
    if (jQuery('.search-is-loading.search-results-container').length > 0) {
        is_loading = true;
    }

    if (is_loading) {
        //Search results loading...
        setTimeout(function(){
            next_page_loaded();
        }, 300);
    }
    else {
        //Search results completed loading!
        extract_data();
    }
}

function next_page() {
    console.log("triggering next page...", running);
    if (running && total_pages <= max_num_search_pages) {
        console.log("Next page triggered!", jQuery(".next-pagination"), jQuery(".next-pagination").length);

        //Normal LinkedIn
        jQuery(".results-paginator").find(".next").trigger('click');

        //Sales Navigator
        Array.from(document.getElementsByClassName("next-pagination")).forEach(function(element) {
            element.click();
        });

        setTimeout(function(){
            next_page_loaded();
        }, 1000);
    }
    else {
        //END
        var end_time = new Date().getTime();
        var elapsed_seconds = (end_time-start_time)/1000;
        var elapsed_minutes = elapsed_seconds/60;
        elapsed_minutes = round(elapsed_minutes, 1);
        alert("Completed pulling info from website (took "+elapsed_minutes+" minutes). \n\nProcess began of enriching data with emails - results will be sent to you at "+email_address_results);
        console.log("**DONE", li_extractor_data);
        console.log(JSON.stringify(li_extractor_data));
        chrome.runtime.sendMessage({"badgetext": ""});
        total_pages = 0;

        var post_data = {};
        post_data['send_to_email'] = email_address_results;
        post_data['data'] = JSON.stringify(li_extractor_data);
        li_extractor_data = [];
        $.ajax({
            type: 'POST',
            url: liextractor_api_url+'/new_job',
            data: post_data,
            dataType: 'json',
            success: function (data) {
                console.log("sent to li-extractor server success", data);
                chrome.runtime.sendMessage({"badgetext": ""});
            },
            error: function(e, type, message) {
                console.log("ERROR", e, type, message);
                chrome.runtime.sendMessage({"badgetext": ""});
            }
        });

        //JSONToCSVConvertor(li_extractor_data, "LinkedInExtractor.csv", true);
    }
}

function extract_data() {
    console.log("Time to extract 'dat data!");

    if (jQuery('.search-results-container').find('#results-list').length) {
        //LinkedIn Sales Navigator
        jQuery('.search-results-container').find('#results-list').find('.result').each(function(){
            var person = {};
            person.name = jQuery(this).find('.name').text().trim();
            person.company_name = jQuery(this).find('.company-name').text().trim();
            person.title = jQuery(jQuery(this).find('.info').find('.info-value')[0]).text().trim();
            person.location = jQuery(jQuery(this).find('.info').find('.info-value')[2]).text().trim();

            var new_person = {
              "name": person.name,
              "location": person.location,
              "title": person.title,
              "company_name": person.company_name
            };
            li_extractor_data.push(new_person);
        });
    }
    else {
        //Normal LinkedIn
        jQuery('.search-result__wrapper').each(function(){
            var person = {};
            person.name = jQuery(this).find('.actor-name').text().trim();
            person.image = jQuery(this).find('.search-result__image').find('img').attr('src') || "";
            person.location = jQuery(this).find('.subline-level-2').text().trim();
            person.tagline = jQuery(this).find('.subline-level-1').text().trim();
            person.current_position = jQuery(this).find('.search-result__snippets').text().replace('Current:', '').trim();
            person.distance = jQuery(this).find('.dist-value').text().trim();
            person.title = "";
            person.company_name = "";
            if (person.current_position.length > 0) {
                var comp_pieces = person.current_position.split(" at ");
                person.title = comp_pieces.shift(); //Drop title
                person.company_name = comp_pieces.join(" at ");
            }
            else {
                var comp_pieces = person.tagline.split(" at ");
                person.title = comp_pieces.shift(); //Drop title
                person.company_name = comp_pieces.join(" at ");
            }
            var new_person = {
              "name": person.name,
              "location": person.location,
              "title": person.title,
              "company_name": person.company_name
            };
            li_extractor_data.push(new_person);
        });
    }
    var total_string = li_extractor_data.length;
    if (total_string > 1000) {
        total_string = round(total_string/1000, 1).toString()+"k";
    }
    else {
      total_string = total_string.toString();
    }
    chrome.runtime.sendMessage({"badgetext": total_string});
    total_pages += 1;

    next_page();
}

/*
$( document ).ready(function() {
    console.log( "page loaded..." );
    setInterval(function(){
        //search-results-container neptune-grid two-column search-is-loading
        console.log("*****", jQuery('.search-is-loading.search-results-container').length);
    }, 1000);
});
*/

function name() {

}















function JSONToCSVConvertor(JSONData, ReportTitle, ShowLabel) {
    //If JSONData is not an object then JSON.parse will parse the JSON string in an Object
    var arrData = typeof JSONData != 'object' ? JSON.parse(JSONData) : JSONData;

    var CSV = '';
    //Set Report title in first row or line

    CSV += ReportTitle + '\r\n\n';

    //This condition will generate the Label/Header
    if (ShowLabel) {
        var row = "";

        //This loop will extract the label from 1st index of on array
        for (var index in arrData[0]) {

            //Now convert each value to string and comma-seprated
            row += index + ',';
        }

        row = row.slice(0, -1);

        //append Label row with line break
        CSV += row + '\r\n';
    }

    //1st loop is to extract each row
    for (var i = 0; i < arrData.length; i++) {
        var row = "";

        //2nd loop will extract each column and convert it in string comma-seprated
        for (var index in arrData[i]) {
            row += '"' + arrData[i][index] + '",';
        }

        row.slice(0, row.length - 1);

        //add a line break after each row
        CSV += row + '\r\n';
    }

    if (CSV == '') {
        alert("Invalid data");
        return;
    }

    //Generate a file name
    var fileName = "MyReport_";
    //this will remove the blank-spaces from the title and replace it with an underscore
    fileName += ReportTitle.replace(/ /g,"_");

    //Initialize file format you want csv or xls
    var uri = 'data:text/csv;charset=utf-8,' + escape(CSV);

    // Now the little tricky part.
    // you can use either>> window.open(uri);
    // but this will not work in some browsers
    // or you will not get the correct file extension

    //this trick will generate a temp <a /> tag
    var link = document.createElement("a");
    link.href = uri;

    //set the visibility hidden so it will not effect on your web-layout
    link.style = "visibility:hidden";
    link.download = fileName + ".csv";

    //this part will append the anchor tag and remove it after automatic click
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}