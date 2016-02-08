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
                        postSubmit("/emails/" + properties.platform, toSubmit),
                        // TODO a loading view
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
                    this.submit(toSubmit);
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
        },

        submit: function (toSubmit) {
            toSubmit.forEach(function (value) {
                postSubmit("/calibrations/" + properties.workerId, value);
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
            parent.postSubmit("/ratings/" + properties.workerId, toSubmit);
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
        if (properties.test === true) {
            $.getJSON("/WorkerUI/resources/" + types.next() + ".json", function (data, status) {
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



            var nextParams = properties.osParams;
            nextParams.worker = workerId !== undefined ? workerId : "";
            if (skipAnswer) {
                nextParams.answer = "skip";
            }
            if (skipRating) {
                nextParams.rating = "skip";
            }


            $.getJSON(nextUrl, nextParams, function (data, status) {
                if (status === "success") {
                    viewNext(data);
                } else {
                    alert(data);
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

    function viewPreview() {
        $.getJSON(properties.workerServiceURL + "preview" + properties.experiment, function (preview) {
            viewNext(preview)
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

    var properties;
    var workerId = undefined;
    var skipAnswer = false;
    var skipRating = false;
    var preview = false;

    return {
        /**
         * Reserved words for osParams:
         * worker, answer, rating
         * @param props
         */
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
            preview === true ? viewPreview() : queryNext();
        }
    }
})();
