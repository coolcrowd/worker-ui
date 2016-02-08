var Ractive = require("ractive");
var $ = require("jquery");

var template = require("../templates/maintemplate.html");

CreativeCrowd = (function () {
    // -------------- Views -------------------
    var DefaultView = Ractive.extend({
        el: "#ractive-container",

        logToSubmit: function () {
            console.log(JSON.stringify(this.get("toSubmit"), null, 4));
        }
    });

    var EmailView = DefaultView.extend({
        template: require("../templates/emailview.html"),

        oninit: function () {
            this.on({
                submit: function () {
                    toSubmit = this.get("toSubmit");
                    Promise.all([
                        postSubmit("/emails/" + properties.platform, toSubmit),
                        // TODO loading view
                        this.set("loading", true)
                    ]).then(function (results) {
                        var postResponse = results[0];
                        if (postResponse.workerId !== undefined) {
                            workerId = postResponse.workerId;
                        }
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
                    this.submit(toSubmit)
                    this.logToSubmit();
                    this.fire("submitCalibration", this.get());
                    this.fire("next");
                },

                radioChange: function () {
                    var radios = this.findAll('input[type="radio"]:checked').map(function (radio) {
                        return {
                            // id is something like 0-1, 0-2, 0-3,
                            // where the first number is the calibrationId and the second the answerOptions.index
                            calibrationId: radio.id.charAt(0),
                            answerOption: radio.value
                        };
                    });
                    this.set("toSubmit", radios);
                }
            });
        },

        submit: function (toSubmit) {

            postSubmit("/calibrations/" + properties.workerId)
        }
    });

    var AnswerView = DefaultView.extend({
        template: require("../templates/answerview.html"),


        oninit: function () {
            this.on({
                submit: function () {
                    toSubmit = {
                        answer: this.get("toSubmit.answer"),
                        experiment: properties.experiment
                    }
                    postSubmit("/answers/" + properties.workerId, toSubmit);

                    this.fire("submitAnswer", this.get(), toSubmit)
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
                    this.logToSubmit();
                    this.fire("submitRating", this.get());
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
                    this.set("toSubmit.constraint", checks);
                }
            });
        },

        submit: function (toSubmit) {
            parent.postSubmit("/ratings/" + properties.workerId);
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
    var properties;
    var workerId = undefined;
    var skipAnswer = false;
    var skipRating = false;

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
        if (properties.workerServiceURL === undefined) {
            $.getJSON("/WorkerUI/test/" + types.next() + ".json", function (data, status) {
                if (status === "success") {
                    viewNext(data);
                } else {
                    console.log(status);
                }
            })
        } else {
            var nextUrl = properties.workerServiceURL + 'next/'
                + properties.platform + '/'
                + properties.experiment;

            var nextParams = {
                worker: workerId !== undefined ? workerId : "",
                answer: skipAnswer ? "skip" : undefined,
                rating: skipRating ? "skip" : ""
            };

            $.getJSON(nextUrl, function (data) {
                viewNext(data);
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
    }

    function postSubmit(endpoint, data) {
        var url = properties.workerServiceURL + endpoint;
        console.log("POST: " + url + "\n" + JSON.stringify(data, null, 4));
        return $.ajax({
            method: "POST",
            url: url,
            contentType: "application/json",
            data: JSON.stringify(data)
        });
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

    return {
        init: function (props) {
            properties = props;
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
         * @param function call gets called with arguments viewData, submittedData
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
            queryNext();
        }
    }
})();
