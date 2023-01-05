import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import data from "./data/data.json";

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/hobit-backend";
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.Promise = Promise;

const port = process.env.PORT || 8080;
const app = express();

// Adding middlewares to enable cors and json body parsing
app.use(cors());
app.use(express.json());

// USER SCHEMA
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  accessToken: {
    type: String,
    default: () => crypto.randomBytes(128).toString("hex")
  },
  programs: {
    activeProgram: {
      category: {
       type: String
     },
     day: {
       type: Number
     },
     startDate: {
       type: String,
     },
   }, 
   completedPrograms: [String]
  }
});

const User = mongoose.model("User", UserSchema);

// PROGRAM CHALLENGE SCHEMA
const ProgramChallengeSchema = new mongoose.Schema({
  day: {
    type: Number
  },
  category: {
    type: String
  },
  title: {
    type: String
  },
  description: {
    type: String
  }
});

// PROGRAM SCHEMA
const ProgramSchema = new mongoose.Schema({
  category: {
    type: String
  },
  challenges: {
    type: [ProgramChallengeSchema]
  }
});

const Program = mongoose.model("Program", ProgramSchema);


// ADD PROGRAMS TO DATABASE
if(process.env.ADD_PROGRAMS) { 
  const addProgramsToDatabase = async () => {
    await Program.deleteMany(); 
    // Delete any duplicate entries
    const temporaryArray = []; 
    // Create a temporary array
    data.forEach(singleChallenge => { 
      //for each challenge object in our data.json file...
      const indexOfObjectWithGivenCategory = temporaryArray.findIndex(element => element.category === singleChallenge.category); 
      // check whether such an object with that category already exists in our temporary array.
      if (indexOfObjectWithGivenCategory < 0) {
        // if not (i.e. findIndex returns -1...)
        const newProgramObject = {
          category: singleChallenge.category,
          challenges: []
        }
        // create a new Program object inside our temporary array, with a key for that singleChallenge category and an empty challenges array
        newProgramObject.challenges.push(singleChallenge)
        // then, add that singleChallenge object to the 'challenges' array of the new Program object
      } else {
        temporaryArray[indexOfObjectWithGivenCategory].challenges.push(singleChallenge)
      }
      // but if findIndex returns 0 or greater, i.e. the forEach loop has already created a newProgramObject, add that singleChallenge to that Program's challenges array.
    });
    temporaryArray.map(singleProgram => {
      // now, for each program object in our temporary array...
      const newProgram = new Program(singleProgram);
      // treat it as a mongoose model
      newProgram.save();
      // and save it to the database
    });
    addProgramsToDatabase();
    // aaaand run!
  }}



// ENDPOINTS
app.get("/", (req, res) => {
  res.send("This is the backend of our project");
});

// USER REGISTRATION, LOGIN AND AUTHENTICATION
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const salt = bcrypt.genSaltSync();
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        response: "Password must be at least 8 characters long"
      });
    } else {
      const newUser = await new User({username, password: bcrypt.hashSync(password, salt)}).save();
      res.status(201).json({
        success: true,
        response: {
          username: newUser.username,
          accessToken: newUser.accessToken,
          id: newUser._id
        }
      });
    }
  } catch(error) {
      res.status(400).json({
        success: false,
        response: error
      });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({username});
    if (user && bcrypt.compareSync(password, user.password)) {
      res.status(200).json({
        success: true,
        response: {
          username: user.username,
          id: user._id,
          accessToken: user.accessToken,
          activeProgram: user.programs.activeProgram.category,
          day: user.programs.activeProgram.day,
          startDate: user.programs.activeProgram.startDate,
          completedPrograms: user.programs.completedPrograms
        }
      });
    } else {
      res.status(400).json({
        success: false,
        response: "Credentials didn't match"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      response: error
    });
  }
});

const authenticateUser = async (req, res, next) => {
  const accessToken = req.header("Authorization");
  try {
    const user = await User.findOne({accessToken: accessToken});
    if (user) {
      next();
    } else {
      res.status(401).json({
        response: "Please log in",
        success: false
      })
    }
  } catch (error) {
    res.status(400).json({
      response: error,
      success: false
    })
  }
}

// FULL LIST OF CHALLENGES (not currently used in app)
app.get('/challenges', (req, res) => {
  res.json(data)
});

// CHALLENGES BY CATEGORY/PROGRAM
app.get('/challenges/:category', (req, res) => {
  const category = req.params.category
  const challengesCategory = data.filter((item) => item.category === category)
  res.json(challengesCategory)
})

// CATEGORY/PROGRAM NAMES (not currently used in app)
app.get('/categories', (req, res) => {
  const categories = new Set()
  for (let i = 0; i < data.length; i++) {
    categories.add(data[i].category)
  }
  const categoriesArray = Array.from(categories)
  return res.status(200).json({'categories': categoriesArray});
});

// USER PROGRAM DATA (not currently used in app)
app.get('/profile', authenticateUser)
app.get('/profile/:userId', async (req, res) => {
	const { userId } = req.params
	try {
		const userPrograms = await User.findById(userId)
		res.status(200).json({
			response: userPrograms.programs,
			success: true,
		})
	} catch (error) {
		res.status(400).json({
			response: error,
			success: false,
		})
	}
})

// UPDATE ACTIVE PROGRAM
app.patch('/updateActiveProgram/:username', async (req, res) => {
  try {
    const updatedProgram = await User.findOneAndUpdate(
      { username: req.params.username },
      {
        $set: {
          'programs.activeProgram.category': req.body.category,
          'programs.activeProgram.day': req.body.day,
          'programs.activeProgram.startDate': req.body.startDate
        }
      },
      { new: true }
    );
    res.json(updatedProgram);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ADD COMPLETED PROGRAM
app.patch('/addCompletedProgram/:username', async (req, res) => {
  try {
    const updatedPrograms = await User.findOneAndUpdate(
      { username: req.params.username },
      { $push: { 'programs.completedPrograms': req.body.programName } },
      { new: true }
    );
    res.json(updatedPrograms);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// START SERVER
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
