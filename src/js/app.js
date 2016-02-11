var Ractive = require("ractive");
var $ = require("jquery");

CreativeCrowd = (function () {

    // -------------- Requests & Helpers -------------------
    var types = loop(["rating", "email", "calibration", "answer", "finished"]);

    function loop(array) {
        var index = 0;
        return {
            next: function () {
                return array[index++ % array.length]
            }
        }
    }

    function getNext() {
        // for testing
        var nextUrl;
        if (properties.DEBUG) {
            nextUrl = properties.workerServiceURL + types.next() + ".json";
        } else {
            nextUrl = properties.workerServiceURL + 'next/'
                + properties.platform + '/'
                + properties.experiment;

            var nextParams = properties.osParams;
            if (worker !== NOWORKER) {
                nextParams.worker = worker;
            }
            if (skipAnswer) {
                nextParams.answer = "skip";
            }
            if (skipRating) {
                nextParams.rating = "skip";
            }
        }

        return $.getJSON(nextUrl, nextParams, function (data, status) {
            if (status === "success") {
                extractWorkerId(data);
                viewNext(data);
            }
        });
    }

    function postSubmit(route, data) {
        var jsonData = JSON.stringify(data);
        console.log("POST: " + route + "\n" + jsonData);
        return $.ajax({
            method: "POST",
            url: route,
            contentType: "application/json",
            // function to print all posted data
            data: jsonData,

            success: function (response, status, xhr) {
                console.log("RESPONSE: " + status + "\n" + JSON.stringify(response, null, 4));
                if (xhr.status === 201) {
                    extractWorkerId(response);
                }
            }
        });
    }


    /**
     * Sends the value of every key in data seperately
     * @param route the route of the endpoint
     * @param data the data
     */
    function multipleSubmit(route, data) {
        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                postSubmit(route, data[key]);
            }
        }
    }

// ------------------ Worker Handling ---------------------

    function extractWorkerId(data) {
        if (data.workerId !== undefined && data.workerId !== 0) {
            worker = data.workerId;
            console.log("Extracted workerId: " + data.workerId);
            persistWorker(worker);
        }
    }

    function persistWorker(workerToSet) {
        if (typeof(Storage) !== "undefined") {
            // Code for localStorage/sessionStorage.
            localStorage.worker = workerToSet;
            console.log("Persisted worker: " + worker);
        } else {
            console.log("No localstorage available! Couldn't persist worker.");
        }
    }

    function loadWorker() {
        if (typeof(Storage) !== "undefined") {
            // Code for localStorage/sessionStorage.
            if (localStorage.worker) {
                worker = localStorage.worker;
                console.log("Loaded worker: " + worker);
                return worker;
            } else {
                console.log("No worker persisted.");
            }
        } else {
            console.log("No localstorage available! Couldn't load worker.");
        }
        return NOWORKER;
    }

// -------------- Views -------------------
    var DefaultView = Ractive.extend({
        el: "#ractive-container",

        logToSubmit: function () {
            console.log(JSON.stringify(this.get("toSubmit"), null, 4));
        },

        partials: {
            experimentHeader: require("../templates/experimentHeaderPartial.html")
        }
    });

    var EmailView = DefaultView.extend({
        template: require("../templates/emailview.html"),

        oninit: function () {
            this.on({
                submit: function () {
                    toSubmit = this.get("toSubmit");
                    postSubmit(routes.email + properties.platform, toSubmit)
                        .done(function () {
                            ractive.fire("submitEmail", ractive.get(), toSubmit);
                            ractive.fire("next");
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
            this.on({
                submit: function () {
                    var toSubmit = this.get("toSubmit");
                    toSubmit.experiment = properties.experiment;
                    // TODO promise
                    multipleSubmit(routes.calibration + worker, toSubmit);
                    this.fire("submitCalibration", this.get(), toSubmit);
                    this.fire("next");
                },

                radioChange: function () {
                    var radios = this.findAll('input[type="radio"]:checked').map(function (radio) {
                        return {
                            answerOption: radio.value
                        };
                    });
                    this.set("toSubmit", radios);
                }
            });
        }
    });

    var AnswerView = DefaultView.extend({
        template: require("../templates/answerview.html"),

        oninit: function () {
            this.on({
                submit: function () {
                    var toSubmit = {
                        answer: this.get("toSubmit.answer"),
                        experiment: properties.experiment
                    };

                    postSubmit(routes.answer + worker, toSubmit).done(function () {
                        // clear answer text field
                        ractive.set("toSubmit.answer", "");
                        this.fire("next");
                    });
                },

                skip: function () {
                    skipAnswer = true;
                    this.fire("next");
                }
            });
        }
    });

    var RatingView = DefaultView.extend({
        template: require("../templates/ratingview.html"),

        oninit: function () {
            //appendRatingId();

            // if answers were skipped dont allow skip ratings
            this.set("skipAllowed", !skipAnswer);
            console.log(JSON.stringify(this.get(""), null, 4));
            this.on({
                submit: function () {
                    /**
                     * As array
                     * ratingId
                     * rating = value of ratingOptions
                     * experiment
                     * answerId
                     * feedback
                     * constraints
                     */

                    var answersToRate = this.get("answersToRate");
                    var toSubmit = [];
                    var experiment = parent.properties.experiment;
                    var ratings = this.get("toSubmit.ratings");
                    var feedback = this.get("toSubmit.feedback");
                    for (var i = 0; i < answersToRate.length; i++) {
                        var ratingId = answersToRate[i].id;
                        var ratedAnswer = {
                            ratingId: ratingId,
                            rating: ratings[ratingId.toString()],
                            experiment: experiment,
                            answerId: answersToRate[i].answerId,
                            feedback: feedback[i]
                        };
                        toSubmit.push(ratedAnswer);
                    }
                    console.log(JSON.stringify(toSubmit, null, 4));
                    multipleSubmit(routes.rating + worker, toSubmit).done(function () {
                        this.fire("submitRating", this.get(), toSubmit);
                        this.fire("next");
                    });
                },

                skip: function () {
                    skipRating = true;
                    this.fire("next");
                },

                radioChange: function () {
                    var previousRatings = ractive.get("toSubmit.ratings");
                    if (previousRatings === undefined) {
                        previousRatings = {};
                    }

                    var ratings = this.findAll('input[type="radio"]:checked').reduce(
                        function (previousRatings, radio, index, array) {
                            var rating = radio.value;
                            // the rating id is stored in the id attribute that looks for example like
                            // id="12-ratingId-0-1" the first number is the ratingId
                            var ratingId = radio.id.split("-", 1)[0].toString();
                            // return object with ratingId as key for rating
                            previousRatings[ratingId] = rating;
                            return previousRatings;
                        }, previousRatings);
                    this.set("toSubmit.ratings", ratings);
                }
            });
        }

    });

    var FinishedView = DefaultView.extend({
        template: require("../templates/finishedview.html"),

        oninit: function () {
            this.on("next", function () {
                this.fire("submitFinished")
            })
        }
    });


//---------------- View building ------------------------

    var ractive, currentViewType;

    function viewNext(next) {
        if (next["type"] === currentViewType) {
            ractive.set(next);
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

            registerHooks();

            ractive.on({
                next: getNext,
                post: postSubmit
            });
        }

    }

// TODO make isolated
    function viewPreview() {
        $.getJSON(routes.preview + properties.experiment, function (preview) {
            preview.isPreview = true;
            viewNext(preview);
        })
    }

    var hooks = {};

    function registerHooks() {
        // how can this be done cleaner?
        if (hooks.any !== undefined) {
            ractive.on("submit", hooks.any);
        }
        if (hooks.email !== undefined) {
            ractive.on("submitEmail", hooks.email);
        }
        if (hooks.calibration !== undefined) {
            ractive.on("submitCalibration", hooks.calibration);
        }
        if (hooks.answer !== undefined) {
            ractive.on("submitAnswer", hooks.answer);
        }
        if (hooks.rating !== undefined) {
            ractive.on("submitRating", hooks.rating);
        }
        if (hooks.finished !== undefined) {
            ractive.on("submitFinished", hooks.finished);
        }
    }

    const NOWORKER = "no_worker_set";
    var properties;
    var worker = NOWORKER;
    var skipAnswer = false;
    var skipRating = false;
    var preview = false;
    var routes = {
        email: "emails/",
        calibration: "calibrations/",
        answer: "answers/",
        rating: "ratings/",
        preview: "preview/"
    };

    function makeRoutes() {
        for (var key in routes) {
            if (routes.hasOwnProperty(key)) {
                routes[key] = properties.workerServiceURL + routes[key];
            }
        }
    }

    return {
        /**
         * Reserved words for osParams:
         * worker, answer, rating
         * @param props
         */
        init: function (props) {
            properties = props;
            if (properties.DEBUG) {
                properties.workerServiceURL = "/WorkerUI/resources/";
            }
            makeRoutes();
            this.currentViewType = "DEFAULT";
            worker = loadWorker();
            $(document).ajaxError(function (event, request, settings, thrownError) {
                alert(request.statusText
                    + JSON.stringify(request.responseJSON, null, 4));
            });
            ractive = new DefaultView();
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

        onFinished: function (call) {
            hooks.finished = call;
        },

        // this needs to block to prevent errors resulting from async access to the ws
        beforeIdentifyWorker: function (call) {
            hooks.identifyWorker = call;
        },

        //starts loading the first "next view"
        load: function () {
            properties.preview === true ? viewPreview() : getNext();
        }
    }
})
();
