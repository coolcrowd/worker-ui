var Ractive = require("ractive");
var $ = require("jquery");

var template = require("../templates/maintemplate.html");

CreativeCrowd = (function () {
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
                    Promise.all([
                        postSubmit(routes.email + properties.platform, toSubmit),
                        // TODO a loading view
                        this.set("loading", true)
                    ]).then(function (results) {
                        var postResponse = results[0];
                        // TODO what?
                        ractive.set("loading", false)
                    });
                    this.fire("submitEmail", this.get(), toSubmit);
                    this.fire("next");
                }
            });
        }
    });

    var CalibrationView = DefaultView.extend({
        template: require("../templates/calibrationview.html"),

        oninit: function () {
            this.on({
                submit: function () {
                    var toSubmit = this.get("toSubmit");
                    toSubmit.experiment = properties.experiment;
                    postSubmit(routes.calibration + worker, toSubmit);
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
                    postSubmit(routes.answer + worker, toSubmit);

                    this.fire("submitAnswer", this.get(), toSubmit);
                    this.fire("next");
                },

                skip: function () {
                    this.fire("next");
                }
            });
        },
    });

    var RatingView = DefaultView.extend({
        template: require("../templates/ratingview.html"),

        oninit: function () {
            this.on({
                submit: function () {
                    this.fire("submitRating", this.get(), toSubmit);
                    this.fire("next");
                },

                skip: function () {
                    this.fire("next");
                },

                checkboxChange: function () {
                    var checks = this.findAll('input[type="checkbox"]:checked').map(function (check) {
                        return {
                            // id is something like 0-1, 0-2, 0-3,
                            // where the first number is the calibrationId and the second the answerOptions.index
                            ratingId: checks.id.charAt(0)
                        };
                    });
                    this.set("toSubmit.constraints", checks);
                },

                //TODO radio submit
                radioChange: function () {
                    var radios = this.findAll('input[type="radio"]:checked').map(function (radio) {
                        return {
                            answerOption: radio.value
                        };
                    });
                    this.set("toSubmit", radios);
                }
            });
        },

        submit: function (toSubmit) {
            parent.postSubmit(routes.rating + worker, toSubmit);
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

    // -------------- Controller -------------------

    var types = loop(["email", "calibration", "answer", "rating", "finished"]);

    function loop(array) {
        var index = 0;
        return {
            next: function () {
                return array[index++ % array.length]
            }
        }
    }

    function queryNext() {
        // for testing
        var nextUrl;
        if (properties.test === true) {
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

        $.getJSON(nextUrl, nextParams, function (data, status) {
            if (status === "success") {
                if (data.workerId !== undefined) {
                    worker = data.workerId;
                }
                viewNext(data);
            } else {
                alert(status);
            }
        });

//                $.ajax({
//                    method: "GET",
//                    url: url,
//                    accepts: "application/json",
//                    // Work with the response
//                    success: function (response) {
//                        console.log(response); // server response
//                        viewNext(response)
//                    }
//                });

    }

    function postSubmit(route, data) {
        console.log("POST: " + route + "\n" + JSON.stringify(data, null, 4));
        return new Promise(function (fulfil, reject) {
            $.ajax({
                method: "POST",
                url: route,
                contentType: "application/json",
                data: JSON.stringify(data),

                success: function (response) {
                    fulfil(response);
                },

                fail: reject(status)
            });
        })
    }

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

            addHooks();

            ractive.on({
                next: queryNext,
                post: postSubmit
            });
        }

    }

    // TODO make isolated
    function viewPreview() {
        $.getJSON(routes.preview + properties.experiment, function (preview) {
            viewNext(preview);
        })
    }

    var hooks = {};

    function addHooks() {
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
            routes[key] = properties.workerServiceURL + routes[key];
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
            if (properties.test) {
                properties.workerServiceURL = "/WorkerUI/resources/"
            }
            makeRoutes();
            this.currentViewType = "DEFAULT";
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

        //starts loading the first "next view"
        load: function () {
            properties.preview === true ? viewPreview() : queryNext();
        }
    }
})
();
