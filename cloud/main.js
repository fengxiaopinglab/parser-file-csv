//require("cloud/app.js");
// Use AV.Cloud.define to define as many cloud functions as you want.
// For example:
//AV.Cloud.define("hello", function (request, response) {
//    response.success("Hello world!");
//});

var fs = require('fs');

var AV = require('avoscloud-sdk').AV;

var LineByLineReader = require('line-by-line');
var _ = require('underscore');

//function createUser(index) {
//    var user = new AV.User();
//    user.set('user_index', index);
//    user.set('username', "user_" + index);
//    user.set('password', "user_" + index);
//    user.signUp();
//}
//
//for (var i = 0; i < 250; i++) {
//    createUser(i);
//}

function Record() {
}

var MULTI_CHOICE_TABLES = ['zyys', 'lxgj'];

var TABLES = {
    //'zgsp': 'data/中国水平.csv',
    //'zyys': 'data/制约因素.csv',
    //'sxsj': 'data/实现时间.csv',
    //'jyhyj': 'data/建议和意见.csv',
    //'jszlydc': 'data/技术子领域调查.csv',
    'sxcd': 'data/熟悉程度.csv',
    'zycd': 'data/重要程度.csv',
    //'lxgj': 'data/领先国家.csv'
}

//var Record = AV.Object.extend('Record');

var MOCK_RECORD_DB = [];

function saveRecord(record) {
    MOCK_RECORD_DB.push(record);
    //return record.save();
    return AV.Promise.as('ok');
}

function readFile(fileKey) {
    var promise = new AV.Promise();
    var table = new LineByLineReader(TABLES[fileKey])

    table.on('error', function (err) {
        // 'err' contains error object
    });

    table.on('line', function (line) {
        // 'line' contains the current line without the trailing newline character.
        table.pause();

        var parts = line.split(',');
        if (isNaN(parseInt(parts[0]))) {
            table.resume();
            return;
        }

        var record = new Record();
        record.table = fileKey;
        record.user_name = parts[0];
        record.project_name = parts[1];

        if (_.contains(["jszlydc", "zycd"], fileKey)) {
            record.question_count = (parts.length - 3) * 4;
            for (var i = 2; i < (parts.length - 1); i++) {
                var question_pos = (i - 2) * 4;
                for (var j = 0; j < 4; j++) {
                    record['question_' + (question_pos + j)] = '';
                }
                if (parts[i] != '') {
                    var diff = parts[i].charCodeAt(0) - 'A'.charCodeAt(0);
                    record['question_' + (question_pos + diff )] = '1';
                }
            }
        } else {
            for (var i = 2; i < parts.length; i++) {
                record['question_' + (i - 2)] = parts[i];
            }
            record['question_count'] = (parts.length - 2);
        }


        //if (MOCK_RECORD_DB.length > 20) {
        //    table.end();
        //}

        saveRecord(record)
            .then(function (r) {
                //console.log('ok,%s', line);
                table.resume();
            }, function (err) {
                console.log("error,%s", record.toJSON());
            })
    });

    table.on('end', function () {
        // All lines are read, file is closed now.
        console.log('completed,%s', fileKey);
        promise.resolve(fileKey);
    });
    return promise;
}

var promises = [];
_.each(TABLES, function (value, key) {
    //console.log(value);
    var promise = readFile(key);
    promises.push(promise);
})

function calProject(records) {
    var count_data = {};
    var rate_data = {};
    var question_count = records[0].question_count;
    var total_count = 0;
    for (var i = 0; i < question_count; i++) {
        count_data['question_' + i] = 0;
        rate_data['question_' + i] = 0;
    }

    _.each(records, function (record) {
        var validAnswer = false;
        for (var i = 0; i < question_count; i++) {
            if (record['question_' + i] === '1') {
                count_data['question_' + i]++;
                validAnswer = true;
            }
        }
        if (validAnswer) {
            total_count++;
        }
    })

    _.each(count_data, function (question_count, index) {
        rate_data[index] = question_count / total_count;
    })

    return {count: count_data, rate: rate_data, validCount: total_count};
}

var REJECT_USER_NAMES = ['12A', '3A'];

function filterAbnormalUsers(list) {
    return _.reject(
        list,
        function (r) {
            return (_.contains(REJECT_USER_NAMES, r.user_name))
        }
    )
}


AV.Promise.when(promises)
    .then(function () {
        console.log("all completed");
        var tables_results = {};

        var sxcd_table = filterAbnormalUsers(
            _.where(MOCK_RECORD_DB, {'table': 'sxcd'})
        )
        var zycd_table = filterAbnormalUsers(
            _.where(MOCK_RECORD_DB, {'table': 'zycd'})
        )

        sxcd_table = _.groupBy(
            sxcd_table,
            function (r) {
                return r.project_name
            }
        )

        //_.each(sxcd_table, function (project, project_name) {
        //        var result = calProject(
        //            project,
        //            _.contains(MULTI_CHOICE_TABLES, key)
        //        );
        //    sxcd_table[project_name] = result.rate;
        //    })

        zycd_table = _.groupBy(
            zycd_table,
            function (r) {
                return r.project_name
            }
        )

        var project_names = _.keys(zycd_table);

        var fileContent = "";

        _.each(project_names, function (project_name) {
            var N_MATRIX = [];
            for (var i = 0; i < 4; i++) {
                N_MATRIX[i] = [];
                for (var j = 0; j < 4 * 3; j++) {
                    N_MATRIX[i][j] = 0;
                }
            }

            var sxcds = sxcd_table[project_name];
            var zycds = zycd_table[project_name];
            //console.log("%s,%s", JSON.stringify(sxcds), JSON.stringify(zycds));

            //_.each(sxcds, function (sxcd) {
            //    _.each(zycds, function (zycd, j) {
            //        if (sxcd['question_' + i] === '1' && zycd['question_' + j ] === '1') {
            //            N_MATRIX[i][j]++;
            //        }
            //    })
            //})

            fileContent += project_name + ',';

            _.each(sxcds, function (sxcd) {
                _.each(zycds, function (zycd) {
                    for (var i = 0; i < 4; i++) {
                        for (var j = 0; j < 12; j++) {
                            if (
                                (sxcd['question_' + i] === '1' && zycd['question_' + j] === '1') &&
                                (sxcd.user_name === zycd.user_name)
                            ) {
                                N_MATRIX[i][j]++;
                            }
                        }
                    }
                })
            })
            _.each(N_MATRIX, function (sxds, i) {
                _.each(N_MATRIX[i], function (sxd) {
                    fileContent += sxd + ',';
                })
            })

            //console.log(N_MATRIX);

            var I_final = 0;
            var I_value = [];
            var I = [];
            var T = []
            _(4).times(function (i) {
                I[i] = 0;
                T[i] = 0;
            })


            for (var category = 0; category < 3; category++) {
                for (var i = 0; i < N_MATRIX.length; i++) {
                    var total = 0;
                    for (var j = 0; j < 4; j++) {
                        total += N_MATRIX[i][category * 4 + j];
                        I[i] += (N_MATRIX[i][j] * 25 * (3 - j));
                    }
                    I[i] = I[i] / (total);
                    T[i] = total;
                }

                I_value.push(
                    (I[0] * T[0] * 4 + I[1] * T[1] * 2 + I[2] * T[2] * 1 ) / (T[0] * 4 + T[1] * 2 + T[2] * 1)
                );
            }

            I_final = Math.sqrt(_.reduce(I_value, function (memo, i) {
                return memo + Math.pow(i, 2);
            }))
            console.log("%s,%s", project_name, I_final);

            for (var i = 0; i < I_value.length; i++) {
                fileContent += I_value[i] + ',';
            }
            fileContent += I_final + '\r\n';
        })


        //console.log(N_MATRIX['I1']);

        fs.writeFile('output_final.csv', fileContent, function (err) {
            console.log('completed')
        })

    })

//AV.Promise.when(promises)
//    .then(function () {
//        console.log("all completed");
//
//        var tables_results = {};
//
//        _.each(TABLES, function (filename, key) {
//            var table = filterAbnormalUsers(
//                _.where(MOCK_RECORD_DB, {'table': key})
//            )
//
//            var grouped = _.groupBy(
//                table,
//                function (r) {
//                    return r.project_name
//                }
//            )
//            //console.log(grouped.length);
//
//            _.each(grouped, function (project, project_name) {
//                var result = calProject(
//                    project,
//                    _.contains(MULTI_CHOICE_TABLES, key)
//                );
//                grouped[project_name] = result.rate;
//            })
//            tables_results[key] = grouped;
//            //console.log(grouped['I1']);
//        })
//
//        var project_names = [];
//        _.each(tables_results, function (result) {
//            project_names = _.union(project_names, _.keys(result));
//        })
//        //console.log('projects,%s', user_names);
//
//        var fileContet = "project_id,";
//
//        _.each(tables_results, function (table, table_name) {
//            _.each(table['I1'], function (value, key) {
//                fileContet += table_name + '_' + key + ','
//            })
//        })
//        fileContet += '\r\n';
//
//        _.each(project_names, function (project_name) {
//            fileContet += project_name + ',';
//            _.each(tables_results, function (table, table_name) {
//                _.each(table[project_name], function (value, key) {
//                    fileContet += value + ',';
//                })
//            })
//            fileContet += '\r\n';
//        })
//        console.log(fileContet)
//
//        fs.writeFile('output.csv', fileContet, function (err) {
//            console.log('completed')
//        })
//
//
//    }, function (err) {
//
//    })

