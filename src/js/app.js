var Ractive = require("ractive");
var $ = require("jquery");

CreativeCrowd = (function () {

    // -------------- Requests & Helpers -------------------
    var types = loop(["email", "calibration", "rating", "answer", "finished"]);
    const EMAIL = 1;
    const CALIBRATION = 2;
    const RATING = 3;
    const ANSWER = 4;
    const FINISHED = 5;

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
        return identifyWorker().then(function ( worker ) {
            nextParams = properties.osParams;
            if (worker !== NO_WORKER) {
                nextParams.worker = worker;
            }
            if (skipAnswer) {
                nextParams.answer = "skip";
            }
            if (skipRating) {
                nextParams.rating = "skip";
            }
        }).then(function () {
                console.log("I run now!");
                return $.getJSON(nextUrl, nextParams, function (data, status) {
                    if (status === "success") {
                        extractWorkerId(data);
                        viewNext(data);
                    }
                })
            }
        );
    }

    function postSubmit(route, data) {
        return identifyWorker().then(function () {
            if (data.email && properties.osParams) {
                route += "?";
                var params = properties.osParams;
                for (var key in params) {
                    if (params.hasOwnProperty(key)) {
                        route += key + "=" + params[key] + "&";
                    }
                }
                route = route.substr(0, route.length - 1);
            }
            var jsonData = JSON.stringify(data);
            console.log("POST: " + route + "\n" + jsonData);
            return jsonData;
        }).then(function ( jsonData ) {
            $.ajax({
                method: "POST",
                url: route,
                contentType: "application/json",
                // function to print all posted data
                data: jsonData
                }).done(function (response, status, xhr) {
                    console.log("RESPONSE: " + status + "\n" + JSON.stringify(response, null, 4));
                    if (xhr.status === 201) {
                        extractWorkerId(response);
                    }
                });
        });
    }


    /**
     * Sends the value of every key in data seperately
     * @param route the route of the endpoint
     * @param data the data
     */
    function multipleSubmit(route, dataArray) {
        // TODO proper handling
        var defer = $.Deferred();
        var submitPromise = {};

        var posts = [];
        for (var i = 0; i < dataArray.length; i++) {
            posts.push(postSubmit(route, dataArray[i]));
        }
        // as long as there are pending requests, wait
        for (i = posts.length; i >= 0; i--) {
            $.when(posts[i]).done(function () {
                posts.pop()
            });
        }
        defer.resolve();

        return defer.promise(submitPromise);
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
            if (localStorage.getItem("worker")) {
                worker = localStorage.getItem("worker");
                console.log("Loaded worker: " + worker);
                return worker;
            } else {
                console.log("No worker persisted.");
            }
        } else {
            console.log("No localstorage available! Couldn't load worker.");
        }
        return NO_WORKER;
    }

    function identifyWorker() {
        if (hooks.identifyWorker !== undefined && worker === NO_WORKER) {
            return hooks.identifyWorker().then(function (params) {
                    properties.osParams = params ? params : {};
                    return NO_WORKER;
                }
            )
        } else {
            return $.Deferred().resolve(worker).promise();
        }
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
            var calibrations = this.get("calibrations");
            for (var calibs in calibrations) {

            }
            var required = new Array(calibrations.length);
            required[0] = true;
            this.set("required", required);

            this.on({
                submit: function () {
                    var toSubmit = this.get("toSubmit");
                    if (this.requireAllRadios() === null) {
                        multipleSubmit(routes.calibration + worker, toSubmit).done(function () {
                            ractive.fire("submitCalibration", ractive.get(), toSubmit);
                            ractive.fire("next");
                        });
                    }
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
        }, sort: function (array, column) {
            array = array.slice(); // clone, so we don't modify the underlying data

            return array.sort(function (a, b) {
                return a[column] < b[column] ? -1 : 1;
            });
        },

        required: function (calibrationId) {
            return calibrations;
        },

        requireAllRadios: function () {

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
                        ractive.fire("submitAnswer", ractive.get(), toSubmit);
                        // clear answer text field
                        ractive.set("toSubmit.answer", "");
                        ractive.fire("next");
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
            this.on({
                submit: function () {
                    var toSubmit;
                    toSubmit = this.parseRatings(function (requiredRating) {
                        ractive.set("answersToRate[requiredRating]", true);
                    });

                    if (toSubmit !== null) {
                        multipleSubmit(routes.rating + worker, toSubmit).done(function () {
                            ractive.fire("submitRating", ractive.get(), toSubmit);
                            ractive.fire("next");
                        });
                    }
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
        },

        parseRatings: function (requireCallback) {
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
            var ratedAnswer;
            for (var i = 0; i < answersToRate.length; i++) {
                var ratingId = answersToRate[i].id;
                var rating = ratings[ratingId.toString()];
                ratedAnswer = {};
                ratedAnswer.ratingId = ratingId;
                if (rating !== undefined) {
                    ratedAnswer.rating = rating;
                } else {
                    requireCallback(ratingId);
                    return null;
                }
                ratedAnswer.experiment = experiment;
                ratedAnswer.answerId = answersToRate[i].answerId;
                ratedAnswer.feedback = feedback[i];
                toSubmit.push(ratedAnswer);
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
                this.fire("submitFinished");
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

    const NO_WORKER = "no_worker_set";
    var properties = {
        preview: false,
        test: false,
        osParams: {}
    };
    var worker = NO_WORKER;
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

    function initProperties( props ) {
        if (props !== undefined) {
            for (var key in props) {
                if (props.hasOwnProperty(key)) {
                    properties[key] = props[key];
                }
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
            initProperties(props);
            makeRoutes();
            this.currentViewType = "DEFAULT";
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


        generateAuthHash: require("./generateAuthHash").generateAuthHash,

        //starts loading the first "next view"
        load: function () {
            worker = loadWorker();
            if (properties.FORCE_VIEW) {
                properties.workerServiceURL = "/WorkerUI/resources/";
            }
            properties.preview === true ? viewPreview() : getNext();

        }
    }
})();
