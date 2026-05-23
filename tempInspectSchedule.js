const mongoose = require('mongoose');
const Schedule = require('./models/Schedule');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/examScheduler';

mongoose.connect(uri)
  .then(async () => {
    const count = await Schedule.countDocuments();
    console.log('schedule count', count);

    const dates = await Schedule.aggregate([
      { $project: { date: { $dateToString: { format: '%Y-%m-%d', date: '$examDate' } }, examTime: 1 } },
      { $group: { _id: '$date', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 10 }
    ]);
    console.log('dates sample', JSON.stringify(dates, null, 2));

    const sample = await Schedule.find().limit(3).populate('studentId').lean();
    console.log('sample', sample.map(s => ({ id: s._id.toString(), date: s.examDate, time: s.examTime, student: s.studentId?.fullName, email: s.studentId?.email })));
    await mongoose.disconnect();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
