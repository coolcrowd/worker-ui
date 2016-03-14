var Ractive = require("ractive");
var $ = require("jquery");
var Mime = require("./mimeType");

WorkerUI = (function () {
    // disable debug mode when minified
    Ractive.DEBUG = /unminified/.test(function () {/*unminified*/
    });
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

    function postSubmit(route, data) {
        return identifyWorker().then(function () {
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
     * Sends the value of every key in data seperately
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

// ------------------ Worker Handling ---------------------

    function extractAuthorization(data) {
        if (data.authorization !== undefined && data.authorization.length !== 0) {
            jwt = data.authorization;
            console.log("Extracted authorization: " + data.authorization);
            persistAuthorization(jwt);
        }
    }

    function persistAuthorization(jwt) {
        if (typeof(Storage) !== "undefined") {
            // Code for sessionStorage/sessionStorage.
            sessionStorage.authorization = jwt;
            console.log("Persisted authorization: " + jwt);
        } else {
            console.log("No sessionStorage available! Couldn't persist authorization.");
        }
    }

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

    function clearAuthorization() {
        if (typeof(Storage) !== "undefined") {
            sessionStorage.clear();
        }
        jwt = NO_AUTH;
    }

    function getAuthenticationHeader() {
        var headers = {};
        if (jwt !== NO_AUTH) {
            headers.Authorization = "Bearer " + jwt;
        }
        return headers;
    }

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

                    /**
                     *  parse into the following scheme
                     *  [
                     *      {
                     *          key: workerId,
                     *          values: [5]
                     *      },
                     *      {
                     *          key: assignmentId,
                     *          values: [121]
                     *      }
                     *  ]
                     */
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
                        toSubmit.platformParameters = paramArray;
                    }
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

    var AnswerView = DefaultView.extend({
        template: require("../templates/answerview.html"),

        oninit: function () {
            // set if skip answers allowed
            this.set("skipAllowed", skipAnswerAllowed);
            // initialise
            this.set("required", false);

            this.on({
                submit: function () {
                    var data = this.get();

                    // check if answer set and not empty
                    if (data.toSubmit.answer === undefined || data.toSubmit.answer.length === 0) {
                        this.set("required", true);
                        return;
                    }

                    // not sure about that
                    //if (data.answerType === "images") {
                    //    Mime.checkIfImage(data.toSubmit.answer);
                    //}

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


    var RatingView = DefaultView.extend({
        template: require("../templates/ratingview.html"),

        neededSubmitsCount: 0,

        oninit: function () {
            // if answers were skipped dont allow skip ratings
            this.set("skipAllowed", (!answerSkipped && skipRatingAllowed));

            // initialize answersToRate[i].required
            var answersToRate = this.get("answersToRate");
            var ratings = [];
            for (var i = 0; i < answersToRate.length; i++) {
                answersToRate[i].required = false;
                answersToRate[i].hidden = false;
                ratings.push(null);
            }
            this.set("answersToRate", answersToRate);
            this.set("toSubmit.ratings", ratings);

            this.neededSubmitsCount = answersToRate.length;

            // register events
            this.on({
                submit: function () {
                    var toSubmit;

                    toSubmit = this.parseRatings();
                    if (toSubmit !== null && toSubmit.length > 0) {
                        ractive.neededSubmitsCount -= toSubmit.length;
                        multipleSubmit(routes.rating, toSubmit).done(function () {
                            ractive.fire("submit.rating", ractive.get(), toSubmit);
                            if (ractive.neededSubmitsCount === 0) {
                                getNext()
                            }
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
            var scrolled = false;
            for (var i = 0; i < answersToRate.length; i++) {
                if (ratings === undefined || ratings[i] === undefined) {
                    // mark missing rating
                    ractive.animate("answersToRate[" + i + "].required", true, {
                        easing: "easeIn",
                        duration: 1000
                    });
                    if (!scrolled) {
                        $('html,body').animate({
                                scrollTop: $("#rating-" + i).offset().top
                            },
                            'slow'
                        );
                        scrolled = true;
                    }
                } else {
                    ratedAnswer = {};
                    ratedAnswer.rating = parseInt(ratings[i]);
                    ratedAnswer.ratingId = answersToRate[i].id;
                    ratedAnswer.experiment = experiment;
                    ratedAnswer.answerId = answersToRate[i].answerId;
                    ratedAnswer.feedback = feedbacks[i];
                    ratedAnswer.constraints = constraints[i];
                    toSubmit.push(ratedAnswer);
                    // hide rated answers
                    //ractive.set("answersToRate[" + i + "].hidden", true);
                }
            }
            return toSubmit;
        }
    });

    var FinishedView = DefaultView.extend({
        template: require("../templates/finishedview.html"),

        oninit: function () {
            var nono = ["no more", "still no more", "really not any more"];
            var i = 0;
            this.on("next", function () {
                this.set("nono", nono[i++ % 3]);
            });

            this.fire("finished");
        }
    });

//---------------- View building ------------------------

    var ractive, currentViewType;

    function viewNext(next) {
        // TODO evaluate if view should always be reloaded
        if (next["type"] === currentViewType) {
            ractive.merge("", next);
        } else {
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
                    ractive = new AnswerView({
                        data: next
                    });
                    break;
                case "RATING":
                    ractive = new RatingView({
                        data: next
                    });
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
    }

// TODO make isolated
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

    var NO_AUTH = "no_authentication_set";
    var properties = {
        preview: false,
        test: false,
        osParams: {}
    };
    var jwt = NO_AUTH;
    var skipAnswerAllowed = true;
    var skipRatingAllowed = true;
    var answerSkipped = false;
    var ratingSkipped = false;
    var preview = false;
    var routes = {};
    var BASE_ROUTES = {
        email: "emails/",
        calibration: "calibrations",
        answer: "answers",
        rating: "ratings",
        preview: "preview/"
    };

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

    function initProperties(props) {
        if (props !== undefined) {
            for (var key in props) {
                if (props.hasOwnProperty(key)) {
                    properties[key] = props[key];
                }
            }
        }
    }

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
         * Reserved words for osParams:
         * authorization, answer, rating
         * @param props
         */
        init: function (props) {
            initProperties(props);
            makeRoutes();
            loadStyles();

            this.currentViewType = "DEFAULT";
            // clear global ajax error handler
            $(document).off("ajaxError");
            // set global ajax error handler
            $(document).ajaxError(function (event, request, settings, thrownError) {
                if (request.status === 0) {
                    alert("Connection error: Could not reach server at " + settings.url + ".");
                } else {
                    alert(request.statusText + ":\n" + JSON.stringify(request.responseJSON, null, 4));
                }
            });
            ractive = new DefaultView();
        },

        //starts loading the first "next view"
        load: function () {
            jwt = loadAuthorization();
            if (properties.FORCE_VIEW) {
                properties.workerServiceURL = "resources/";
            }
            properties.preview === true ? viewPreview() : getNext();

        },

        onSubmitAny: function (call) {
            hooks.any = call;
        },

        onSubmitEmail: function (call) {
            hooks.email = call;
        },

        onSubmitCalibration: function (call) {
            hooks.calibration = call
        },

        /**
         *
         * @param call the function call that gets called with arguments viewData, submittedData
         */
        onSubmitAnswer: function (call) {
            hooks.answer = call;
        },

        onSubmitRating: function (call) {
            hooks.rating = call;
        },

        /**
         * This funtion is called when return is finished
         * @param call
         */
        onFinished: function (call) {
            hooks.finished = call;
        },

        beforeIdentifyWorker: function (call) {
            hooks.identifyWorker = call;
        },

        clearWorker: function () {
            clearAuthorization();
        },

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
