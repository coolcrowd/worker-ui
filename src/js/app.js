var Ractive = require("ractive");
var $ = require("jquery");
var Mime = require("./mimeType");

/**
 * The WorkerUI object can be used as a library to display all views for the worker-service
 * You need to call init() with initialization properties and can display the views with load()
 *
 * @type {{init, load, onSubmitAny, onSubmitEmail, onSubmitCalibration, onSubmitAnswer, onSubmitRating, onFinished, beforeIdentifyWorker, clearWorker, getWorker, generateAuthHash}}
 */
WorkerUI = (function () {
    // disable debug mode when minified
    Ractive.DEBUG = /unminified/.test(function () {/*unminified*/
    });

    // -------------- Global Vars --------------------------
    var NO_AUTH;
    var properties = {};
    var jwt;
    var skipAnswerAllowed;
    var skipRatingAllowed;
    var answerSkipped;
    var ratingSkipped;
    var preview;
    var routes = {};
    var BASE_ROUTES = {
        email: "emails/",
        calibration: "calibrations",
        answer: "answers",
        rating: "ratings",
        preview: "preview/",
        experiments: "experiments/"
    };

    function resetVariables() {
        NO_AUTH = "no_authentication_set";
        properties = {
            preview: false,
            test: false,
            experimentsViewEnabled: false,
            osParams: {}
        };
        jwt = NO_AUTH;
        skipAnswerAllowed = true;
        skipRatingAllowed = true;
        answerSkipped = false;
        ratingSkipped = false;
        preview = false;
        routes = {};
    }

    // -------------- Requests & Helpers -------------------
    var types = loop(["email", "calibration", "answer", "rating", "finished"]);
    var EMAIL = 1;
    var CALIBRATION = 2;
    var RATING = 3;
    var ANSWER = 4;
    var FINISHED = 5;

    function loop(array) {
        var index = 0;
        return {
            next: function (viewNum) {
                if (viewNum) {
                    return array[viewNum - 1];
                } else {
                    return array[index++ % array.length];
                }
            }
        }
    }

    /**
     * Fetches the next view from the worker-service and calls the method to display the next view
     *
     * @returns {*}
     */
    function getNext() {
        var nextUrl;
        if (properties.FORCE_VIEW) {
            nextUrl = properties.workerServiceURL + types.next(properties.FORCE_VIEW) + ".json";
        } else {
            nextUrl = properties.workerServiceURL + 'next/'
                + properties.platform + '/'
                + properties.experiment;
        }

        var nextParams = {};
        return identifyWorker().then(function () {
            nextParams = properties.osParams;
            if (answerSkipped) {
                nextParams.answer = "skip";
            }
            if (ratingSkipped) {
                nextParams.rating = "skip";
            }
        }).then(function () {
                var ajax = $.ajax({
                    dataType: "json",
                    url: nextUrl,
                    data: nextParams,
                    headers: getAuthenticationHeader()
                });

                ajax.done(function (data, status) {
                    if (status === "success") {
                        extractAuthorization(data);
                        viewNext(data);
                    }
                });

                return ajax;
            }
        );
    }

    /**
     * Posts data to the worker-service.
     * Tries to identify a worker before.
     * @param route the url to post to
     * @param data
     * @returns {*}
     */
    function postSubmit(route, data) {
        return identifyWorker().then(function () {
            // in case of email
            if (data.email !== undefined) {
                data = insertOsParameters(data);
            }
            var jsonData = JSON.stringify(data);
            console.log("POST: " + route + "\n" + jsonData);
            return jsonData;
        }).then(function (jsonData) {
            if (properties.NO_POST) {
                return $.Deferred().resolve();
            } else {
                var ajax = $.ajax({
                    method: "POST",
                    url: route,
                    contentType: "application/json",
                    // function to print all posted data
                    data: jsonData,
                    headers: getAuthenticationHeader()
                });

                ajax.done(function (response, status, xhr) {
                    console.log("RESPONSE: " + status + "\n" + JSON.stringify(response, null, 4));
                    if (xhr.status === 201) {
                        extractAuthorization(response);
                    }
                });

                return ajax;
            }
        });
    }


    /**
     * Sends every data element in the array separately via postSubmit().
     * @param route the route of the endpoint
     * @param dataArray the data
     */
    function multipleSubmit(route, dataArray) {
        var postSubmits = [];

        for (var i = 0; i < dataArray.length; i++) {
            // Push promise to 'deferreds' array
            postSubmits.push(postSubmit(route, dataArray[i]));
        }

        // Use .apply onto array from deferreds
        var multipleAjax = $.when.apply($, postSubmits);
        return multipleAjax;
    }

    /**
     * Insert the object-service parameters into the data object
     *
     * @param data
     * @returns {*}
     */
    function insertOsParameters(data) {
        if (properties.osParams) {
            var paramArray = [];
            var pair = {};
            for (var param in properties.osParams) {
                if (properties.osParams.hasOwnProperty(param)) {
                    var valueArray = [];
                    valueArray.push(properties.osParams[param]);
                    pair.key = param;
                    pair.values = valueArray;
                    paramArray.push(pair);
                    pair = {};
                }
            }
            data.platformParameters = paramArray;
        }
        return data;
    }

// ------------------ Worker Handling ---------------------

    /**
     * Extracts the authorization of a response from the worker-service
     *
     * @param data
     */
    function extractAuthorization(data) {
        if (data.authorization !== undefined && data.authorization.length !== 0) {
            jwt = data.authorization;
            console.log("Extracted authorization: " + data.authorization);
            persistAuthorization(jwt);
        }
    }

    /**
     * Persists the authorization to the sessionStorage
     *
     * @param jwt the authorization
     */
    function persistAuthorization(jwt) {
        if (typeof(Storage) !== "undefined") {
            // Code for sessionStorage/sessionStorage.
            sessionStorage.authorization = jwt;
            console.log("Persisted authorization: " + jwt);
        } else {
            console.log("No sessionStorage available! Couldn't persist authorization.");
        }
    }

    /**
     * Loads the authorization from the sessionStorage
     * @returns {string}
     */
    function loadAuthorization() {
        if (typeof(Storage) !== "undefined") {
            // Code for sessionStorage/sessionStorage.
            if (sessionStorage.getItem("authorization")) {
                jwt = sessionStorage.getItem("authorization");
                console.log("Loaded authorization: " + jwt);
                return jwt;
            } else {
                console.log("No authorization persisted.");
            }
        } else {
            console.log("No sessionStorage available! Couldn't load authorization.");
        }
        return NO_AUTH;
    }

    /**
     * Clear the authorization in sessionStorage and set jwt to NO_AUTH
     */
    function clearAuthorization() {
        if (typeof(Storage) !== "undefined") {
            sessionStorage.clear();
        }
        jwt = NO_AUTH;
    }

    /**
     * Returns the authentication token header
     *
     * @returns {{}}
     */
    function getAuthenticationHeader() {
        var headers = {};
        if (jwt !== NO_AUTH) {
            headers.Authorization = "Bearer " + jwt;
        }
        return headers;
    }

    /**
     * Tries to identify a worker if no worker is set
     * @returns {*}
     */
    function identifyWorker() {
        if (hooks.identifyWorker !== undefined && jwt === NO_AUTH) {
            return hooks.identifyWorker().then(function (params) {
                    properties.osParams = params ? params : {};
                    return NO_AUTH;
                }
            )
        } else {
            return $.Deferred().resolve(jwt).promise();
        }
    }


// -------------- Views -------------------
    var DefaultView = Ractive.extend({
        el: "#ractive-container",

        partials: {
            experimentHeader: require("../templates/experimentHeaderPartial.html")
        },

        onconfig: function () {
            registerHooks(this);
        }
    });

    var EmailView = DefaultView.extend({
        template: require("../templates/emailview.html"),

        oninit: function () {
            this.on({
                submit: function () {
                    var toSubmit = this.get("toSubmit");

                    postSubmit(routes.email + properties.platform, toSubmit).done(function () {
                        ractive.fire("submit.email", ractive.get(), toSubmit);
                        getNext()
                    });
                },

                focus: function () {
                    this.set("valid", this.validateEmail(this.get("toSubmit.email")));
                }
            });

            this.set({
                validate: this.validateEmail,
                valid: true
            });

            this.observe("toSubmit.email", function (newValue, oldValue) {
                if (oldValue !== undefined) {
                    this.set("valid", this.validateEmail(newValue));
                }
            });
        },

        validateEmail: function (email) {
            // http://stackoverflow.com/a/46181/11236
            var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return re.test(email);
        }

    });

    var CalibrationView = DefaultView.extend({
        template: require("../templates/calibrationview.html"),

        oninit: function () {
            // initialize calibrations[i].required
            var calibrations = this.get("calibrations");
            for (var i = 0; i < calibrations.length; i++) {
                calibrations[i].required = false;
            }
            this.set("calibrations", calibrations);

            this.on({
                submit: function () {
                    var toSubmit = this.parseCalibrations();
                    if (toSubmit !== null && toSubmit.length > 0) {
                        multipleSubmit(routes.calibration, toSubmit).done(function () {
                            ractive.fire("submit.calibration", ractive.get(), toSubmit);
                            getNext()
                        });
                    }
                }
            });
        },

        /**
         * Parses ratings from the view and marks missing values.
         * @returns {Array}
         */
        parseCalibrations: function () {
            var toSubmit = [];
            var calibrations = ractive.get("calibrations");
            var answerOptions = ractive.get("toSubmit.answerOptions");
            var calibration;
            for (var i = 0; i < calibrations.length; i++) {
                if (answerOptions === undefined || answerOptions[i] === undefined) {
                    // mark missing calibration
                    ractive.set("calibrations[" + i + "].required", true);
                } else {
                    calibration = {};
                    calibration.answerOption = parseInt(answerOptions[i]);
                    toSubmit.push(calibration);
                }
            }
            return toSubmit;
        }
    });

    /**
     * Check if mimetype of answer matches given type
     *
     * @param type
     * @returns {boolean}
     */
    function answerTypeMatches(type) {
        var answerType = this.get("answerType");
        // true if answerType begins with specified type.
        return answerType.indexOf(type) === 0;
    }

    /**
     * Constructs a new AnswerView
     *
     * @param data the data to initialize the view with
     * @returns {{value, writable, configurable}|{value}|*}
     */
    function newAnswerView(data) {
        data.skipAllowed = skipAnswerAllowed;
        data.required = false;

        data.answerTypeMatches = answerTypeMatches;

        return new AnswerView({
            data: data
        });
    }

    var AnswerView = DefaultView.extend({
        template: require("../templates/answerview.html"),

        oninit: function () {
            this.on({
                submit: function () {
                    var data = this.get();

                    // check if answer set and not empty
                    if (data.toSubmit.answer === undefined || data.toSubmit.answer.length === 0) {
                        this.set("required", true);
                        return;
                    }

                    // make copy to use reservation again if post fails
                    var reservation = data.answerReservations.slice();
                    var toSubmit = {
                        answer: data.toSubmit.answer,
                        experiment: properties.experiment,
                        reservation: reservation.pop()
                    };

                    postSubmit(routes.answer, toSubmit).done(function () {
                        // reset field required
                        ractive.set("required", false);
                        // update reservation if post succeeded
                        ractive.set("answerReservations", reservation);
                        ractive.fire("submit.answer", ractive.get(), toSubmit);
                        // clear answer text field
                        ractive.set("toSubmit.answer", "");
                        ractive.set("skipAllowed", true);
                        getNext()
                    });
                },

                skip: function () {
                    answerSkipped = true;
                    getNext()
                }
            });
        }
    });


    /**
     * Constructs a new RatingView
     *
     * @param data the data to initialize the view with
     * @returns {{value, writable, configurable}|{value}|*}
     */
    function newRatingView(data) {
        // initialise data
        if (data.constraints === undefined || data.constraints.length === 0) {
            data.constraints = [{name: undefined, id: undefined}];
        }

        // if answers were skipped don't allow skip ratings
        data.skipAllowed = (!answerSkipped && skipRatingAllowed);

        // initialize answersToRate[i].required
        var answersToRate = data.answersToRate;
        var ratings = [];
        var feedbacks = [];
        for (var i = 0; i < answersToRate.length; i++) {
            answersToRate[i].required = false;
            ratings.push(null);
            feedbacks.push("");
        }
        data.answersToRate = answersToRate;
        data.toSubmit = {};
        data.toSubmit.ratings = ratings;
        data.toSubmit.feedbacks = feedbacks;

        data.neededSubmitsCount = answersToRate.length;
        data.answerTypeMatches = answerTypeMatches;
        return new RatingView({
            data: data
        });
    }

    var RatingView = DefaultView.extend({
        template: require("../templates/ratingview.html"),

        oninit: function () {
            // register events
            this.on({
                submit: function () {
                    var toSubmit = this.parseRatings();
                    if (toSubmit !== null && toSubmit.length > 0) {
                        multipleSubmit(routes.rating, toSubmit).done(function () {
                            ractive.fire("submit.rating", ractive.get(), toSubmit);
                            //set skip ratings to allowed after one submit was successful if skipRatingIs allowed
                            skipRatingAllowed = true;
                            getNext()
                        });
                    }
                },

                removeRequired: function (event, i) {
                    ractive.set("answersToRate[" + i + "].required", false);
                },

                skip: function () {
                    ratingSkipped = true;
                    this.fire("next");
                }
            });
        },

        /**
         * Parses ratings from the view and marks missing values.
         * @returns {Array}
         */
        parseRatings: function () {
            var toSubmit = [];
            var answersToRate = this.get("answersToRate");
            var experiment = properties.experiment;
            var ratings = this.get("toSubmit.ratings");
            var feedbacks = this.get("toSubmit.feedbacks");
            var constraints = this.get("toSubmit.constraints");
            var ratedAnswer;
            for (var i = 0; i < answersToRate.length; i++) {
                if (ratings === undefined || ratings[i] === undefined) {
                    // mark missing rating
                    ractive.animate("answersToRate[" + i + "].required", true, {
                        easing: "easeIn",
                        duration: 1000
                    });
                } else {
                    ratedAnswer = {};
                    ratedAnswer.rating = parseInt(ratings[i]);
                    ratedAnswer.ratingId = answersToRate[i].id;
                    ratedAnswer.experiment = experiment;
                    ratedAnswer.answerId = answersToRate[i].answerId;
                    ratedAnswer.feedback = feedbacks[i];
                    if (constraints == null) {
                        ratedAnswer.constraints = [];
                    } else {
                        ratedAnswer.constraints = constraints[i];
                    }
                    toSubmit.push(ratedAnswer);
                }
            }
            return toSubmit;
        }
    });

    var FinishedView = DefaultView.extend({
        template: require("../templates/finishedview.html"),

        oninit: function () {
            this.finishCountDown(5);
            this.on("finish", function () {
                this.fire("finished");
            });

        },

        //time in seconds
        finishCountDown: function( time ) {
            this.set("countDown", time);

            window.setTimeout(countDownTimer, 1000);
            function countDownTimer() {
                var countDown = ractive.get("countDown");
                if (countDown === 0) {
                    ractive.fire("finish");
                } else {
                    ractive.subtract("countDown");
                    window.setTimeout(countDownTimer, 1000);
                }
            }
        }
    });


//---------------- View building ------------------------

    var ractive, currentViewType;

    /**
     * Loads the next view from a response of the <i>next</i> request
     * @param next the response from the <i>next</i> request
     */
    function viewNext(next) {
        ractive.teardown();
        switch (next["type"]) {
            case "EMAIL":
                ractive = new EmailView({
                    data: next
                });
                break;
            case "CALIBRATION":
                ractive = new CalibrationView({
                    data: next
                });
                break;
            case "ANSWER":
                ractive = newAnswerView(next);
                break;
            case "RATING":
                ractive = newRatingView(next);
                break;
            case "FINISHED":
                ractive = new FinishedView({
                    data: next
                });
                break;
            default:
                console.log("Unknown type: " + next["type"])
        }
        currentViewType = next["type"];
    }


    /**
     * Display the preview of the task
     */
    function viewPreview() {
        $.getJSON(routes.preview + properties.experiment, function (preview) {
            preview.isPreview = true;
            viewNext(preview);
        })
    }


    /**
     * Overwrites object1's values with obj2's and adds object2's if non existent in object1
     * @param object1
     * @param object2
     * @returns object a new object based on object1 and object2
     */
    function mergeObject(object1, object2) {
        var result = {};
        var prop;
        for (prop in object1) {
            if (object1.hasOwnProperty(prop)) {
                result[prop] = object1[prop];
            }
        }
        for (prop in object2) {
            if (object2.hasOwnProperty(prop)) {
                result[prop] = object2[prop];
            }
        }
        return result;
    }

    var hooks = {};

    /**
     * Registers the hooks for the api callbacks
     * @param ractive
     */
    function registerHooks(ractive) {
        // how can this be done cleaner?
        if (hooks.any !== undefined) {
            ractive.on("submit.*", hooks.any);
        }
        if (hooks.email !== undefined) {
            ractive.on("submit.email", hooks.email);
        }
        if (hooks.calibration !== undefined) {
            ractive.on("submit.calibration", hooks.calibration);
        }
        if (hooks.answer !== undefined) {
            ractive.on("submit.answer", hooks.answer);
        }
        if (hooks.rating !== undefined) {
            ractive.on("submit.rating", hooks.rating);
        }
        if (hooks.finished !== undefined) {
            ractive.on("finished", hooks.finished);
        }
    }

    /**
     * Makes the routes for the workerServiceURL by adding the base routes
     */
    function makeRoutes() {
        // ensure trailing slash
        if (properties.workerServiceURL.charAt(properties.workerServiceURL.length - 1) !== "/") {
            properties.workerServiceURL += "/";
        }

        for (var key in BASE_ROUTES) {
            if (BASE_ROUTES.hasOwnProperty(key)) {
                routes[key] = properties.workerServiceURL + BASE_ROUTES[key];
            }
        }
    }

    /**
     * Initialize the properties and attach them to the global properties variable
     * @param props
     */
    function initProperties(props) {
        if (props !== undefined) {
            for (var key in props) {
                if (props.hasOwnProperty(key)) {
                    properties[key] = props[key];
                }
            }
        }
    }

    /**
     * Loads the styles for the ui by attaching them to the document header.
     */
    function loadStyles() {
        var $worker_ui = $('#worker_ui');
        if ($worker_ui.length > 0) {
            var pathname = $worker_ui.attr("src");
            var index = pathname.lastIndexOf("/") + 1;
            var stylePath = pathname.slice(0, index) + "screen.css";

            var head = $('head');
            head.append('<link rel="stylesheet" href="' + stylePath + '" type="text/css" />');
            head.append('<link rel="stylesheet" href="//maxcdn.bootstrapcdn.com/font-awesome/4.5.0/css/font-awesome.min.css">');
        } else {
            console.log("To enable css styles please ensure that the worker_ui.js script tag has the attribute id='worker_ui' set.");
        }
        var $container = $('#ractive-container');
        if ($container.length > 0) {
            $container.addClass("max-width");
        } else {
            alert("Please ensure there is a div tag with the attribute id='ractive-container' set. " +
                "This serves as entry point for the views.")
        }
    }

    return {
        /**
         * Initializes the whole library.
         * Possible:
         * {
         *      workerServiceURL: "${WS_URL}",
         *      platform: "dummydummy",
         *      experiment: 1,
         *      // optional
         *      preview: false,
         *      // this will force the answer view
         *      FORCE_VIEW: 3,
         *      // this will skip posts
         *      NO_POST: true,
         *      // these params will be passed to the crowdplatform implementaion in the object service (optional)
         *      osParams: {
         *          //e.g.
         *          workerId: 121,
         *          assignmentId: 1234
         *      }
         * }
         *
         * @param props the properties to set. Reserved words words for osParams: answer, rating
         */
        init: function (props) {
            resetVariables();
            initProperties(props);
            makeRoutes();
            loadStyles();

            this.currentViewType = "DEFAULT";
            // clear global ajax error handler
            $(document).off("ajaxError");
            // set global ajax error handler
            $(document).ajaxError(function (event, request, settings, thrownError) {
                switch (request.status) {
                    case 0:
                        alert("Connection error: Could not reach server at " + settings.url + ".");
                        break;
                    case 500:
                        alert("Sorry, an internal server error occurred.");
                        console.log(JSON.stringify(request.responseJSON, null, 4));
                        break;
                    default:
                        alert(request.statusText + ":\n" + JSON.stringify(request.responseJSON, null, 4));
                }
            });
            ractive = new DefaultView();
        },

        /**
         * Loads the view and makes it visible
         */
        load: function () {
            jwt = loadAuthorization();
            if (properties.FORCE_VIEW) {
                properties.workerServiceURL = "resources/";
            }
            properties.preview === true ? viewPreview() : getNext();

        },

        /**
         * Calls the passed function when data is submitted from any view.
         *
         * @param call the function to call. viewData, submittedData will be passed to the function.
         */
        onSubmitAny: function (call) {
            hooks.any = call;
        },

        /**
         * Calls the passed function when data is submitted from the email view.
         *
         * @param call the function to call. viewData, submittedData will be passed to the function.
         */
        onSubmitEmail: function (call) {
            hooks.email = call;
        },

        /**
         * Calls the passed function when data is submitted from the calibration view.
         *
         * @param call the function to call. viewData, submittedData will be passed to the function.
         */
        onSubmitCalibration: function (call) {
            hooks.calibration = call
        },

        /**
         * Calls the passed function when data is submitted from the answer view.
         *
         * @param call the function to call. viewData, submittedData will be passed to the function.
         */
        onSubmitAnswer: function (call) {
            hooks.answer = call;
        },

        /**
         * Calls the passed function when data is submitted from the rating view.
         *
         * @param call the function to call. viewData, submittedData will be passed to the function.
         */
        onSubmitRating: function (call) {
            hooks.rating = call;
        },

        /**
         * This function is called when the current task is finished
         * @param call the function to call.
         */
        onFinished: function (call) {
            hooks.finished = call;
        },

        /**
         * Calls the passed function when a worker needs to be identified.
         * The function should be async and return a deferred.
         * @param call
         */
        beforeIdentifyWorker: function (call) {
            hooks.identifyWorker = call;
        },

        /**
         * Clears the worker. Causes a new authentication afterwards.
         */
        clearWorker: function () {
            clearAuthorization();
        },


        /**
         * Get the current worker.
         * @returns {*}
         */
        getWorker: function () {
            if (jwt === NO_AUTH) {
                return loadAuthorization();
            } else {
                return jwt;
            }
        },

        generateAuthHash: require("./generateAuthHash").generateAuthHash
    }
})();
